import { NextRequest, NextResponse } from "next/server";
import { devRouteGuard } from "@/lib/dev-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const guard = await devRouteGuard();
  if (guard) return guard;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { applicationId?: string };
  const applicationId = body?.applicationId?.trim();

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const admin = getAdminClient();
  const now = new Date().toISOString();

  // 1. Fetch job_applications first so applicant_id is known up front
  const { data: app, error: appLookupError } = await admin
    .from("job_applications")
    .select("id, applicant_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appLookupError) {
    return NextResponse.json({ error: appLookupError.message }, { status: 500 });
  }

  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // 2. Delete employees rows FIRST so employees_job_offer_id_fkey never blocks deleting job_offers
  const employeeDeleteQuery = app.applicant_id
    ? admin
        .from("employees")
        .delete()
        .or(`application_id.eq.${applicationId},profile_id.eq.${app.applicant_id}`)
    : admin.from("employees").delete().eq("application_id", applicationId);

  const { error: employeeError } = await employeeDeleteQuery;

  if (employeeError) {
    return NextResponse.json({ error: employeeError.message }, { status: 500 });
  }

  // 3. Delete job_offer_negotiations rows if table exists
  try {
    await admin
      .from("job_offer_negotiations")
      .delete()
      .eq("application_id", applicationId);
  } catch {
    // Table may not exist in all environments; ignore
  }

  // 4. Delete signed_documents rows for this application
  const { error: signedDocsError } = await admin
    .from("signed_documents")
    .delete()
    .eq("application_id", applicationId);

  if (signedDocsError) {
    return NextResponse.json({ error: signedDocsError.message }, { status: 500 });
  }

  // 5. Delete job_offers rows for this application
  const { error: jobOffersError } = await admin
    .from("job_offers")
    .delete()
    .eq("application_id", applicationId);

  if (jobOffersError) {
    return NextResponse.json({ error: jobOffersError.message }, { status: 500 });
  }

  // 6. Best-effort cleanup of offer/hire notifications for this applicant
  if (app.applicant_id) {
    try {
      await admin
        .from("notifications")
        .delete()
        .eq("recipient_id", app.applicant_id)
        .in("type", ["hire_confirmed", "offer_letter", "offer_signed"])
        .ilike("action_url", `%${applicationId}%`);
    } catch {
      // Non-blocking notification cleanup
    }
  }

  // 7. Reset job_applications.status to 'offer' and contract_offer_id to null
  const { error: appUpdateError } = await admin
    .from("job_applications")
    .update({
      status: "offer",
      contract_offer_id: null,
      updated_at: now,
    })
    .eq("id", applicationId);

  if (appUpdateError) {
    return NextResponse.json({ error: appUpdateError.message }, { status: 500 });
  }

  // 8. Reset profiles.role back to 'applicant' if currently 'employee'
  if (app.applicant_id) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        role: "applicant",
        updated_at: now,
      })
      .eq("id", app.applicant_id)
      .eq("role", "employee");

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    applicationId,
    status: "offer",
  });
}

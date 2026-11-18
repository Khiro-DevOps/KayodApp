import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

  // 1. Delete job_offer_negotiations rows if table exists
  try {
    await admin
      .from("job_offer_negotiations")
      .delete()
      .eq("application_id", applicationId);
  } catch {
    // Table may not exist in all environments; ignore
  }

  // 2. Delete signed_documents rows for this application
  const { error: signedDocsError } = await admin
    .from("signed_documents")
    .delete()
    .eq("application_id", applicationId);

  if (signedDocsError) {
    return NextResponse.json({ error: signedDocsError.message }, { status: 500 });
  }

  // 3. Delete job_offers rows for this application
  const { error: jobOffersError } = await admin
    .from("job_offers")
    .delete()
    .eq("application_id", applicationId);

  if (jobOffersError) {
    return NextResponse.json({ error: jobOffersError.message }, { status: 500 });
  }

  // 4. Reset job_applications.status to 'offer' and contract_offer_id to null
  const { data: app, error: appError } = await admin
    .from("job_applications")
    .update({
      status: "offer",
      contract_offer_id: null,
      updated_at: now,
    })
    .eq("id", applicationId)
    .select("id, applicant_id")
    .maybeSingle();

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // 5. If an employees row exists for this application_id, set it inactive (do not delete)
  const { error: employeeError } = await admin
    .from("employees")
    .update({
      employment_status: "inactive",
      updated_at: now,
    })
    .eq("application_id", applicationId);

  if (employeeError) {
    return NextResponse.json({ error: employeeError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    applicationId,
    status: "offer",
  });
}

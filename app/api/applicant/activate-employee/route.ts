import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const admin = getAdminClient();

  const [{ data: employeeRow }, { data: hiredAppRow }, { data: profileRow }] =
    await Promise.all([
      admin
        .from("employees")
        .select("id, tenant_id")
        .eq("profile_id", user.id)
        .maybeSingle(),
      admin
        .from("job_applications")
        .select("id")
        .eq("applicant_id", user.id)
        .eq("status", "hired")
        .limit(1)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("role, tenant_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (!employeeRow && !hiredAppRow) {
    return NextResponse.redirect(new URL("/applicant/applications", req.url));
  }

  const currentRole = String(profileRow?.role ?? "").toLowerCase();
  if (currentRole !== "employee" && !isHRRole(currentRole)) {
    const updatePayload: {
      role: string;
      updated_at: string;
      tenant_id?: string;
    } = {
      role: "employee",
      updated_at: new Date().toISOString(),
    };

    if (!profileRow?.tenant_id && employeeRow?.tenant_id) {
      updatePayload.tenant_id = employeeRow.tenant_id;
    }

    await admin.from("profiles").update(updatePayload).eq("id", user.id);
  }

  await admin
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("recipient_id", user.id)
    .eq("type", "hire_confirmed")
    .eq("is_read", false);

  revalidatePath("/applicant", "layout");
  revalidatePath("/employee", "layout");

  return NextResponse.redirect(new URL("/employee/dashboard?welcome=1", req.url));
}

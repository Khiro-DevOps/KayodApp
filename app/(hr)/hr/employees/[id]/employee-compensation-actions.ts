"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

const HR_ROLES = new Set(["hr", "hr_manager", "admin"]);

export async function updateEmployeeCompensationAction(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !HR_ROLES.has(String(profile.role ?? "").toLowerCase())) {
    return { success: false, error: "Forbidden: HR role required" };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const rawSalary = Number(formData.get("base_salary"));
  const rawFreq = String(formData.get("pay_frequency") ?? "monthly").trim().toLowerCase();
  const payFrequency = rawFreq === "semi_monthly" ? "semi_monthly" : "monthly";

  if (!employeeId) {
    return { success: false, error: "Missing employee ID" };
  }
  if (!Number.isFinite(rawSalary) || rawSalary < 0) {
    return { success: false, error: "Base salary must be a valid non-negative number" };
  }

  const admin = getAdminClient();
  const { data: targetEmp } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (!targetEmp) {
    return { success: false, error: "Employee not found" };
  }

  if (
    profile.tenant_id &&
    targetEmp.tenant_id &&
    profile.tenant_id !== targetEmp.tenant_id
  ) {
    return { success: false, error: "Forbidden: cross-tenant access" };
  }

  const { error: updateErr } = await admin
    .from("employees")
    .update({
      base_salary: rawSalary,
      pay_frequency: payFrequency,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/hr/payroll");

  return { success: true };
}

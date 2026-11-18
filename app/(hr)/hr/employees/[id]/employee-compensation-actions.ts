"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";

export async function updateEmployeeCompensationAction(formData: FormData): Promise<{
  ok: boolean;
  success: boolean;
  warning?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, success: false, error: "Unauthorized" };
  }

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> })
    .raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    return { ok: false, success: false, error: "Forbidden: HR role required" };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const rawSalary = Number(formData.get("base_salary"));
  const rawFreq = String(formData.get("pay_frequency") ?? "monthly").trim().toLowerCase();
  const payFrequency =
    rawFreq === "semi_monthly" || rawFreq === "weekly" || rawFreq === "bi_weekly"
      ? rawFreq
      : "monthly";

  if (!employeeId) {
    return { ok: false, success: false, error: "Missing employee ID" };
  }
  if (!Number.isFinite(rawSalary) || rawSalary < 0) {
    return { ok: false, success: false, error: "Base salary must be a valid non-negative number" };
  }

  const { data: targetEmp, error: fetchErr } = await admin
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, success: false, error: fetchErr.message };
  }
  if (!targetEmp) {
    return { ok: false, success: false, error: "Employee not found" };
  }

  const { error: updateErr } = await admin
    .from("employees")
    .update({
      base_salary: rawSalary,
      pay_frequency: payFrequency,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId);

  let warning: string | undefined;

  if (updateErr) {
    const errMsg = updateErr.message.toLowerCase();
    if (
      errMsg.includes("pay_frequency") ||
      errMsg.includes("schema cache") ||
      errMsg.includes("check constraint") ||
      errMsg.includes("invalid input value for enum") ||
      errMsg.includes("updated_at")
    ) {
      const { error: retryErr } = await admin
        .from("employees")
        .update({ base_salary: rawSalary })
        .eq("id", employeeId);

      if (retryErr) {
        return { ok: false, success: false, error: retryErr.message };
      }
      warning = `Saved base_salary (pay_frequency skipped: ${updateErr.message})`;
    } else {
      return { ok: false, success: false, error: updateErr.message };
    }
  }

  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/hr/payroll");
  revalidatePath("/hr/payslips");

  return { ok: true, success: true, warning };
}

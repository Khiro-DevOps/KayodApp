"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";

export async function updateEmployeeCompensationAction(formData: FormData): Promise<{
  ok: boolean;
  success: boolean;
  warning?: string;
  error?: string;
}> {
  const ctx = await getHrSessionContext();
  if (!ctx) {
    return { ok: false, success: false, error: "Unauthorized" };
  }

  if (
    !canHr(ctx.hr_role, "workforce:manage", ctx.is_tenant_owner) &&
    !canHr(ctx.hr_role, "payroll:manage", ctx.is_tenant_owner)
  ) {
    return { ok: false, success: false, error: "Forbidden: insufficient HR permissions" };
  }

  const admin = getAdminClient();

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const rawSalary = Number(formData.get("base_salary"));
  const rawAllowance = Number(formData.get("monthly_allowance") ?? 0);
  const rawIncentive = Number(formData.get("attendance_incentive") ?? 0);
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
  if (!Number.isFinite(rawAllowance) || rawAllowance < 0) {
    return { ok: false, success: false, error: "Monthly allowance must be a valid non-negative number" };
  }
  if (!Number.isFinite(rawIncentive) || rawIncentive < 0) {
    return { ok: false, success: false, error: "Attendance incentive must be a valid non-negative number" };
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
      monthly_allowance: rawAllowance,
      attendance_incentive: rawIncentive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId);

  let warning: string | undefined;

  if (updateErr) {
    const errMsg = updateErr.message.toLowerCase();
    if (
      errMsg.includes("monthly_allowance") ||
      errMsg.includes("attendance_incentive") ||
      errMsg.includes("pay_frequency") ||
      errMsg.includes("schema cache") ||
      errMsg.includes("check constraint") ||
      errMsg.includes("invalid input value for enum") ||
      errMsg.includes("updated_at")
    ) {
      const { error: fallbackFreqErr } = await admin
        .from("employees")
        .update({
          base_salary: rawSalary,
          pay_frequency: payFrequency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", employeeId);

      if (!fallbackFreqErr) {
        warning = `Saved base_salary & pay_frequency (allowance/incentive columns skipped: ${updateErr.message})`;
      } else {
        const { error: retryErr } = await admin
          .from("employees")
          .update({ base_salary: rawSalary })
          .eq("id", employeeId);

        if (retryErr) {
          return { ok: false, success: false, error: retryErr.message };
        }
        warning = `Saved base_salary (extra compensation fields skipped: ${updateErr.message})`;
      }
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

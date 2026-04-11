"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function verifyHR(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", userId).single();
  return profile && ["hr_manager", "admin"].includes(profile.role);
}

export async function createPayrollPeriod(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodStart = formData.get("period_start") as string;
  const periodEnd   = formData.get("period_end") as string;
  const payDate     = formData.get("pay_date") as string;

  const { error } = await supabase.from("payroll_periods").insert({
    period_start: periodStart,
    period_end:   periodEnd,
    pay_date:     payDate,
    status:       "draft",
    created_by:   user.id,
  });

  if (error) redirect(`/payroll?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function generatePayslips(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodId = formData.get("period_id") as string;

  // Get all active employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, base_salary")
    .eq("employment_status", "active");

  if (!employees || employees.length === 0) {
    redirect("/payroll?error=No active employees found");
  }

  // Generate payslip for each employee
  const payslips = employees.map((emp) => {
    const basic = Number(emp.base_salary);
    // Philippines standard deductions (simplified)
    const sss       = Math.min(basic * 0.045, 1125);   // 4.5% capped
    const philhealth = basic * 0.02;                    // 2%
    const pagibig   = Math.min(basic * 0.02, 200);      // 2% capped at 200

    return {
      payroll_period_id:  periodId,
      employee_id:        emp.id,
      basic_pay:          basic,
      overtime_pay:       0,
      allowances:         0,
      bonuses:            0,
      sss_contribution:   Number(sss.toFixed(2)),
      philhealth_contrib: Number(philhealth.toFixed(2)),
      pagibig_contrib:    Number(pagibig.toFixed(2)),
      withholding_tax:    0,
      other_deductions:   0,
      status:             "pending_approval",
    };
  });

  await supabase.from("payslips").insert(payslips);

  // Update period status
  await supabase
    .from("payroll_periods")
    .update({ status: "pending_approval" })
    .eq("id", periodId);

  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function approvePayroll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodId = formData.get("period_id") as string;

  // Mark all payslips as paid
  await supabase
    .from("payslips")
    .update({ status: "paid" })
    .eq("payroll_period_id", periodId);

  // Mark period as paid
  await supabase
    .from("payroll_periods")
    .update({ status: "paid", approved_by: user.id })
    .eq("id", periodId);

  revalidatePath("/payroll");
  redirect("/payroll");
}

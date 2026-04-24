"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function verifyHR(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return profile && ["hr_manager", "admin"].includes(profile.role);
}

// ─── Philippines withholding tax (simplified TRAIN law brackets) ───────────
function computeWithholdingTax(monthlyTaxable: number): number {
  if (monthlyTaxable <= 20_833) return 0;
  if (monthlyTaxable <= 33_333) return (monthlyTaxable - 20_833) * 0.20;
  if (monthlyTaxable <= 66_667) return 2_500 + (monthlyTaxable - 33_333) * 0.25;
  if (monthlyTaxable <= 166_667) return 10_833 + (monthlyTaxable - 66_667) * 0.30;
  if (monthlyTaxable <= 666_667) return 40_833 + (monthlyTaxable - 166_667) * 0.32;
  return 200_833 + (monthlyTaxable - 666_667) * 0.35;
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

  // 1. Get the period dates
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("period_start, period_end")
    .eq("id", periodId)
    .single();

  if (!period) redirect("/payroll?error=Period not found");

  // 2. Get all active employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, base_salary, pay_frequency, employment_type")
    .eq("employment_status", "active");

  if (!employees || employees.length === 0) {
    redirect("/payroll?error=No active employees found");
  }

  // 3. Get all time_logs for this period (clock-out records have total_hours)
  const { data: timeLogs } = await supabase
    .from("time_logs")
    .select("employee_id, total_hours")
    .eq("punch_type", "out")
    .gte("punched_at", `${period.period_start}T00:00:00Z`)
    .lte("punched_at", `${period.period_end}T23:59:59Z`);

  // Build a map of employee_id → total hours worked this period
  const hoursMap: Record<string, number> = {};
  for (const log of timeLogs ?? []) {
    hoursMap[log.employee_id] = (hoursMap[log.employee_id] ?? 0) + (log.total_hours ?? 0);
  }

  // 4. Build payslips
  const payslips = employees.map((emp) => {
    const baseSalary  = Number(emp.base_salary);
    const hoursWorked = hoursMap[emp.id] ?? 0;

    // For hourly/part-time: pay based on hours punched
    // For salaried/full-time: pay full base_salary regardless of hours
    const isHourly =
      emp.employment_type === "part-time" ||
      emp.employment_type === "contract" ||
      emp.employment_type === "internship";

    // Derive hourly rate from monthly salary (÷ 173.33 = PH standard monthly hours)
    const hourlyRate = baseSalary / 173.33;
    const basicPay   = isHourly
      ? Math.round(hourlyRate * hoursWorked * 100) / 100
      : baseSalary;

    // Philippines statutory deductions
    const sss        = Math.min(basicPay * 0.045, 1_125);
    const philhealth = basicPay * 0.02;
    const pagibig    = Math.min(basicPay * 0.02, 200);

    // Withholding tax on taxable income (gross - SSS - PhilHealth - Pagibig)
    const taxable        = Math.max(0, basicPay - sss - philhealth - pagibig);
    const withholdingTax = computeWithholdingTax(taxable);

    return {
      payroll_period_id:  periodId,
      employee_id:        emp.id,
      basic_pay:          Number(basicPay.toFixed(2)),
      overtime_pay:       0,
      allowances:         0,
      bonuses:            0,
      sss_contribution:   Number(sss.toFixed(2)),
      philhealth_contrib: Number(philhealth.toFixed(2)),
      pagibig_contrib:    Number(pagibig.toFixed(2)),
      withholding_tax:    Number(withholdingTax.toFixed(2)),
      other_deductions:   0,
      status:             "pending_approval",
      // Store hours worked in remarks for transparency
      remarks: isHourly
        ? `Hours worked: ${hoursWorked.toFixed(2)}h @ ₱${hourlyRate.toFixed(2)}/hr`
        : `Salaried. Hours logged: ${hoursWorked.toFixed(2)}h`,
    };
  });

  // 5. Delete any previously generated payslips for this period (allow re-generation)
  await supabase
    .from("payslips")
    .delete()
    .eq("payroll_period_id", periodId);

  await supabase.from("payslips").insert(payslips);

  // 6. Advance period status
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

  await supabase
    .from("payslips")
    .update({ status: "paid" })
    .eq("payroll_period_id", periodId);

  await supabase
    .from("payroll_periods")
    .update({ status: "paid", approved_by: user.id })
    .eq("id", periodId);

  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function rejectPayroll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodId = formData.get("period_id") as string;

  await supabase
    .from("payroll_periods")
    .update({ status: "draft" })
    .eq("id", periodId);

  await supabase
    .from("payslips")
    .delete()
    .eq("payroll_period_id", periodId);

  revalidatePath("/payroll");
  redirect("/payroll");
}
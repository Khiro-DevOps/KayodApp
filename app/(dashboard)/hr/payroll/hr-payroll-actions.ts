"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
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
  return profile && ["hr", "hr_manager", "admin"].includes(profile.role);
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

  if (error) redirect(`/hr/payroll?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/hr/payroll");
  redirect("/hr/payroll");
}

export async function generatePayslips(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodId = formData.get("period_id") as string;
  const customAllowances = Math.max(0, Number(formData.get("allowances") ?? 0) || 0);
  const customBonuses = Math.max(0, Number(formData.get("bonuses") ?? 0) || 0);
  const customOtherDeductions = Math.max(0, Number(formData.get("other_deductions") ?? 0) || 0);
  const customRemarks = String(formData.get("remarks") ?? "").trim();

  // 1. Get the period dates
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("period_start, period_end")
    .eq("id", periodId)
    .single();

  if (!period) redirect("/hr/payroll?error=Period+not+found");

  // 2. Get all active employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, base_salary, pay_frequency, employment_type")
    .eq("employment_status", "active");

  if (!employees || employees.length === 0) {
    redirect("/hr/payroll?error=No+active+employees+found");
  }

  // 3. Get all time records (attendance_logs or legacy time_logs) for this period
  const { data: attendanceLogs } = await supabase
    .from("attendance_logs")
    .select("employee_id, total_hours")
    .not("clock_out", "is", null)
    .gte("clock_in", `${period.period_start}T00:00:00Z`)
    .lte("clock_in", `${period.period_end}T23:59:59Z`);

  const { data: timeLogs } = await supabase
    .from("time_logs")
    .select("employee_id, total_hours")
    .eq("punch_type", "out")
    .gte("punched_at", `${period.period_start}T00:00:00Z`)
    .lte("punched_at", `${period.period_end}T23:59:59Z`);

  // Build maps of employee_id → total hours & overtime hours worked this period
  const hoursMap: Record<string, number> = {};
  const otHoursMap: Record<string, number> = {};

  const processRecord = (empId: string, hrs: number) => {
    hoursMap[empId] = (hoursMap[empId] ?? 0) + hrs;
    if (hrs > 8) {
      otHoursMap[empId] = (otHoursMap[empId] ?? 0) + (hrs - 8);
    }
  };

  for (const log of attendanceLogs ?? []) {
    processRecord(log.employee_id, log.total_hours ?? 0);
  }

  for (const log of timeLogs ?? []) {
    processRecord(log.employee_id, log.total_hours ?? 0);
  }

  // 4. Build payslips
  const payslips = employees.map((emp) => {
    const monthlySalary = Number(emp.base_salary || 0);
    const freq = String(emp.pay_frequency ?? "monthly").toLowerCase();
    const isSemiOrBiweekly = freq === "semi_monthly" || freq === "biweekly";
    const periodSalary = isSemiOrBiweekly ? monthlySalary / 2 : monthlySalary;
    const hoursWorked = hoursMap[emp.id] ?? 0;
    const otHours     = otHoursMap[emp.id] ?? 0;

    // For hourly/part-time: pay based on hours punched
    // For salaried/full-time: pay periodSalary based on pay_frequency
    const isHourly =
      emp.employment_type === "part_time" ||
      emp.employment_type === "contract" ||
      emp.employment_type === "intern";

    // Derive hourly rate from monthly salary (÷ 173.33 = PH standard monthly hours)
    const hourlyRate = monthlySalary / 173.33;
    const basicPay   = isHourly
      ? Math.round(hourlyRate * hoursWorked * 100) / 100
      : periodSalary;

    // Calculate Overtime (OT) pay (1.25x hourly rate for hours > 8)
    const overtimePay = Math.round(hourlyRate * 1.25 * otHours * 100) / 100;

    // Demo statutory-style deductions (non-statutory demo computation)
    const sss        = Math.min(basicPay * 0.045, 1_125);
    const philhealth = basicPay * 0.02;
    const pagibig    = Math.min(basicPay * 0.02, 200);

    // Withholding tax on taxable income (gross - SSS - PhilHealth - Pagibig)
    const taxable        = Math.max(0, basicPay + overtimePay + customAllowances + customBonuses - sss - philhealth - pagibig);
    const withholdingTax = computeWithholdingTax(taxable);

    const baseNote = isHourly
      ? `Demo Computation (${freq}) | Hours: ${hoursWorked.toFixed(2)}h @ ₱${hourlyRate.toFixed(2)}/hr | OT: ${otHours.toFixed(2)}h`
      : `Demo Computation (${freq}) | Hours logged: ${hoursWorked.toFixed(2)}h | OT: ${otHours.toFixed(2)}h`;
    const remarks = customRemarks ? `${baseNote} | ${customRemarks}` : baseNote;

    return {
      payroll_period_id:  periodId,
      employee_id:        emp.id,
      basic_pay:          Number(basicPay.toFixed(2)),
      overtime_pay:       Number(overtimePay.toFixed(2)),
      allowances:         Number(customAllowances.toFixed(2)),
      bonuses:            Number(customBonuses.toFixed(2)),
      sss_contribution:   Number(sss.toFixed(2)),
      philhealth_contrib: Number(philhealth.toFixed(2)),
      pagibig_contrib:    Number(pagibig.toFixed(2)),
      withholding_tax:    Number(withholdingTax.toFixed(2)),
      other_deductions:   Number(customOtherDeductions.toFixed(2)),
      status:             "pending_approval",
      remarks,
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

  revalidatePath("/hr/payroll");
  redirect("/hr/payroll");
}

export async function approvePayroll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const periodId = formData.get("period_id") as string;

  await supabase
    .from("payslips")
    .update({ status: "published" })
    .eq("payroll_period_id", periodId);

  await supabase
    .from("payroll_periods")
    .update({ status: "paid", approved_by: user.id })
    .eq("id", periodId);

  // Notify each paid employee
  try {
    const admin = getAdminClient();
    const { data: period } = await admin
      .from("payroll_periods")
      .select("period_start, period_end")
      .eq("id", periodId)
      .maybeSingle();

    const { data: slips } = await admin
      .from("payslips")
      .select("employee_id, employees(profile_id)")
      .eq("payroll_period_id", periodId);

    const periodLabel = period
      ? `${period.period_start} to ${period.period_end}`
      : "recent pay period";

    const profileIds = Array.from(
      new Set(
        (slips ?? [])
          .map((s) => {
            const emp = Array.isArray(s.employees) ? s.employees[0] : s.employees;
            return (emp as { profile_id?: string | null } | null)?.profile_id ?? null;
          })
          .filter((id): id is string => Boolean(id))
      )
    );

    await Promise.all(
      profileIds.map((recipientId) =>
        sendNotification({
          recipientId,
          senderId: user.id,
          type: "payroll_processed",
          title: "New Payslip Available",
          body: `Your payslip for ${periodLabel} has been published.`,
          actionUrl: "/employee/payslips",
          actionName: "approvePayroll",
        })
      )
    );
  } catch (notifyErr) {
    console.error("approvePayroll: failed to notify employees:", notifyErr);
  }

  revalidatePath("/hr/payroll");
  revalidatePath("/employee/payslips");
  redirect("/hr/payroll");
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

  revalidatePath("/hr/payroll");
  redirect("/hr/payroll");
}
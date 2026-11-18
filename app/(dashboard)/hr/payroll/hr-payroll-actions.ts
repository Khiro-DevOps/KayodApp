"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";
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
    .select("id, base_salary, salary, pay_frequency, employment_type, shift_start, shift_end, work_days")
    .eq("employment_status", "active");

  if (!employees || employees.length === 0) {
    redirect("/hr/payroll?error=No+active+employees+found");
  }

  // 3. Get attendance_logs and approved leave_requests for this period
  const { data: attendanceLogs } = await supabase
    .from("attendance_logs")
    .select("employee_id, date, clock_in, clock_out, late_minutes")
    .gte("clock_in", `${period.period_start}T00:00:00Z`)
    .lte("clock_in", `${period.period_end}T23:59:59Z`);

  const empIds = employees.map((e) => e.id);
  const { data: approvedLeaves } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, end_date, status")
    .in("employee_id", empIds)
    .eq("status", "approved")
    .lte("start_date", period.period_end)
    .gte("end_date", period.period_start);

  // 4. Build payslips using detailed demo payslip computation engine
  const payslips = employees.map((emp) => {
    const monthlySalary = Number(emp.base_salary ?? emp.salary ?? 0);
    const empLogs = (attendanceLogs ?? []).filter((l) => l.employee_id === emp.id);
    const empLeaves = (approvedLeaves ?? []).filter((lr) => lr.employee_id === emp.id);

    const computed = computeEmployeeDemoPayslip({
      monthlyBaseSalary: monthlySalary,
      payFrequency: emp.pay_frequency,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      shiftStart: emp.shift_start,
      shiftEnd: emp.shift_end,
      workDays: Array.isArray(emp.work_days) ? (emp.work_days as string[]) : null,
      attendanceLogs: empLogs,
      approvedLeaves: empLeaves,
      allowances: customAllowances,
      hrBonuses: customBonuses,
      hrOtherDeductions: customOtherDeductions,
      customRemarks,
    });

    return {
      payroll_period_id:  periodId,
      employee_id:        emp.id,
      basic_pay:          computed.basic_pay,
      overtime_pay:       computed.overtime_pay,
      allowances:         computed.allowances,
      bonuses:            computed.bonuses,
      sss_contribution:   computed.sss_contribution,
      philhealth_contrib: computed.philhealth_contrib,
      pagibig_contrib:    computed.pagibig_contrib,
      withholding_tax:    computed.withholding_tax,
      other_deductions:   computed.other_deductions,
      status:             "pending_approval",
      remarks:            computed.remarks,
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

export async function publishSinglePayslip(input: FormData | string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const payslipId = typeof input === "string"
    ? input.trim()
    : String(input.get("payslip_id") ?? "").trim();

  if (!payslipId) {
    if (typeof input === "string") return { success: false, error: "Missing payslip id" };
    redirect("/hr/payroll?error=Missing+payslip+id");
  }

  const { error: updateError } = await supabase
    .from("payslips")
    .update({ status: "published" })
    .eq("id", payslipId);

  if (updateError) {
    if (typeof input === "string") return { success: false, error: updateError.message };
    redirect(`/hr/payroll?error=${encodeURIComponent(updateError.message)}`);
  }

  try {
    const admin = getAdminClient();
    const { data: slip } = await admin
      .from("payslips")
      .select("id, payroll_period_id, employees(profile_id), payroll_periods(period_start, period_end)")
      .eq("id", payslipId)
      .maybeSingle();

    const emp = Array.isArray(slip?.employees) ? slip?.employees[0] : slip?.employees;
    const recipientId = (emp as { profile_id?: string | null } | null)?.profile_id ?? null;
    const period = Array.isArray(slip?.payroll_periods)
      ? slip?.payroll_periods[0]
      : slip?.payroll_periods;
    const periodLabel = period
      ? `${(period as { period_start: string; period_end: string }).period_start} to ${(period as { period_start: string; period_end: string }).period_end}`
      : "recent pay period";

    if (recipientId) {
      await sendNotification({
        recipientId,
        senderId: user.id,
        type: "payroll_processed",
        title: "New Payslip Available",
        body: `Your payslip for ${periodLabel} has been published.`,
        actionUrl: "/employee/payslips",
        actionName: "publishSinglePayslip",
      });
    }
  } catch (notifyErr) {
    console.error("publishSinglePayslip: failed to notify employee:", notifyErr);
  }

  revalidatePath("/hr/payroll");
  revalidatePath("/employee/payslips");
  if (typeof input === "string") {
    return { success: true };
  }
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
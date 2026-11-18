"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function verifyHR(
  user: { id: string; user_metadata?: Record<string, unknown>; raw_user_meta_data?: Record<string, unknown> }
) {
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  return isHRRole(effectiveRole(profile?.role, authRole));
}

export async function createPayrollPeriod(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(user)) redirect("/dashboard");

  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd   = String(formData.get("period_end") ?? "").trim();
  const payDate     = String(formData.get("pay_date") ?? "").trim();

  if (!periodStart || !periodEnd || !payDate) {
    redirect("/hr/payslips?error=All+period+dates+are+required");
  }

  const admin = getAdminClient();
  const { data: insertedPeriod, error } = await admin
    .from("payroll_periods")
    .insert({
      period_start: periodStart,
      period_end:   periodEnd,
      pay_date:     payDate,
      status:       "draft",
      created_by:   user.id,
    })
    .select("id")
    .maybeSingle();

  if (error) redirect(`/hr/payslips?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/hr/payroll");
  revalidatePath("/hr/payslips");
  redirect(insertedPeriod?.id ? `/hr/payslips?periodId=${insertedPeriod.id}` : "/hr/payslips");
}

export async function generatePayslips(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(user)) redirect("/dashboard");

  const periodId = String(formData.get("period_id") ?? "").trim();
  if (!periodId) redirect("/hr/payslips?error=Missing+payroll+period+ID");

  const customAllowances = Math.max(0, Number(formData.get("allowances") ?? 0) || 0);
  const customBonuses = Math.max(0, Number(formData.get("bonuses") ?? 0) || 0);
  const customOtherDeductions = Math.max(0, Number(formData.get("other_deductions") ?? 0) || 0);
  const customRemarks = String(formData.get("remarks") ?? "").trim();

  const admin = getAdminClient();

  // 1. Get the period dates
  const { data: period, error: periodError } = await admin
    .from("payroll_periods")
    .select("period_start, period_end")
    .eq("id", periodId)
    .single();

  if (periodError || !period) {
    const msg = periodError?.message ?? "Period not found";
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(msg)}`);
  }

  // 2. Get all active employees
  const { data: employees, error: employeesError } = await admin
    .from("employees")
    .select("id, base_salary, salary, pay_frequency, employment_type, shift_start, shift_end, work_days")
    .eq("employment_status", "active");

  if (employeesError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(employeesError.message)}`);
  }

  if (!employees || employees.length === 0) {
    redirect(`/hr/payslips?periodId=${periodId}&error=No+active+employees+found`);
  }

  // 3. Get attendance_logs and approved leave_requests for this period
  const { data: attendanceLogs } = await admin
    .from("attendance_logs")
    .select("employee_id, date, clock_in, clock_out, late_minutes")
    .gte("clock_in", `${period.period_start}T00:00:00Z`)
    .lte("clock_in", `${period.period_end}T23:59:59Z`);

  const empIds = employees.map((e) => e.id);
  const { data: approvedLeaves } = await admin
    .from("leave_requests")
    .select("employee_id, start_date, end_date, status")
    .in("employee_id", empIds)
    .eq("status", "approved")
    .lte("start_date", period.period_end)
    .gte("end_date", period.period_start);

  // 4. Build payslips matching exact public.payslips columns in supabase/schema.sql
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

  // 5. Delete existing draft / pending_approval payslips for this period before inserting fresh rows
  const { error: deleteError } = await admin
    .from("payslips")
    .delete()
    .eq("payroll_period_id", periodId)
    .in("status", ["draft", "pending_approval"]);

  if (deleteError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(deleteError.message)}`);
  }

  // Also clear any leftover payslips for this period so unique(payroll_period_id, employee_id) never conflicts
  await admin
    .from("payslips")
    .delete()
    .eq("payroll_period_id", periodId);

  const { error: insertError } = await admin.from("payslips").insert(payslips);
  if (insertError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(insertError.message)}`);
  }

  // 6. Advance period status to pending_approval
  const { error: periodUpdateError } = await admin
    .from("payroll_periods")
    .update({ status: "pending_approval" })
    .eq("id", periodId);

  if (periodUpdateError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(periodUpdateError.message)}`);
  }

  revalidatePath("/hr/payroll");
  revalidatePath("/hr/payslips");
  redirect(`/hr/payslips?periodId=${periodId}`);
}

export async function approvePayroll(input: FormData | string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(user)) redirect("/dashboard");

  const periodId = typeof input === "string"
    ? input.trim()
    : String(input.get("period_id") ?? "").trim();

  if (!periodId) {
    redirect("/hr/payslips?error=Missing+payroll+period+ID");
  }

  const admin = getAdminClient();

  // Update payslips to "published" (fallback to "paid" if DB enum payroll_status rejects "published")
  let { error: slipsUpdateError } = await admin
    .from("payslips")
    .update({ status: "published" })
    .eq("payroll_period_id", periodId);

  if (slipsUpdateError) {
    const fallback = await admin
      .from("payslips")
      .update({ status: "paid" })
      .eq("payroll_period_id", periodId);
    slipsUpdateError = fallback.error;
  }

  if (slipsUpdateError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(slipsUpdateError.message)}`);
  }

  const { error: periodUpdateError } = await admin
    .from("payroll_periods")
    .update({ status: "approved", approved_by: user.id })
    .eq("id", periodId);

  if (periodUpdateError) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(periodUpdateError.message)}`);
  }

  // Notify each paid employee
  try {
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
  revalidatePath("/hr/payslips");
  revalidatePath("/employee/payslips");
  redirect(`/hr/payslips?periodId=${periodId}`);
}

export async function publishSinglePayslip(input: FormData | string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(user)) redirect("/dashboard");

  const payslipId = typeof input === "string"
    ? input.trim()
    : String(input.get("payslip_id") ?? "").trim();

  if (!payslipId) {
    if (typeof input === "string") return { success: false, error: "Missing payslip id" };
    redirect("/hr/payslips?error=Missing+payslip+id");
  }

  const admin = getAdminClient();
  let { error: updateError } = await admin
    .from("payslips")
    .update({ status: "published" })
    .eq("id", payslipId);

  if (updateError) {
    const fallback = await admin
      .from("payslips")
      .update({ status: "paid" })
      .eq("id", payslipId);
    updateError = fallback.error;
  }

  if (updateError) {
    if (typeof input === "string") return { success: false, error: updateError.message };
    redirect(`/hr/payslips?error=${encodeURIComponent(updateError.message)}`);
  }

  let periodIdForRedirect: string | null = null;
  try {
    const { data: slip } = await admin
      .from("payslips")
      .select("id, payroll_period_id, employees(profile_id), payroll_periods(period_start, period_end)")
      .eq("id", payslipId)
      .maybeSingle();

    periodIdForRedirect = slip?.payroll_period_id ?? null;
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
  revalidatePath("/hr/payslips");
  revalidatePath("/employee/payslips");
  if (typeof input === "string") {
    return { success: true };
  }
  redirect(periodIdForRedirect ? `/hr/payslips?periodId=${periodIdForRedirect}` : "/hr/payslips");
}

export async function rejectPayroll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(user)) redirect("/dashboard");

  const periodId = String(formData.get("period_id") ?? "").trim();
  if (!periodId) redirect("/hr/payslips?error=Missing+payroll+period+ID");

  const admin = getAdminClient();

  const { error: periodErr } = await admin
    .from("payroll_periods")
    .update({ status: "draft" })
    .eq("id", periodId);

  if (periodErr) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(periodErr.message)}`);
  }

  const { error: deleteErr } = await admin
    .from("payslips")
    .delete()
    .eq("payroll_period_id", periodId);

  if (deleteErr) {
    redirect(`/hr/payslips?periodId=${periodId}&error=${encodeURIComponent(deleteErr.message)}`);
  }

  revalidatePath("/hr/payroll");
  revalidatePath("/hr/payslips");
  redirect(`/hr/payslips?periodId=${periodId}`);
}
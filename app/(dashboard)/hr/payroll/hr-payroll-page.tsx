import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/ui/page-container";
import type { PayrollPeriod, Payslip, Employee, Profile } from "@/lib/types";
import { PAYROLL_STATUS_COLORS } from "@/lib/types";
import { computeEmployeeDemoPayslip } from "@/lib/payroll-calculator";
import { resolveOfferCompensation, type OfferSalarySource } from "@/lib/offer-salary";
import { resolveEmployeePosition } from "@/lib/employee-position";
import { getJobPostingPositionsByProfileIds } from "@/lib/employee-position-server";
import {
  createPayrollPeriod,
  generatePayslips,
  approvePayroll,
  publishSinglePayslip,
  rejectPayroll,
} from "./hr-payroll-actions";
import { PayrollSubmitButton } from "./payroll-submit-button";
import { PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

interface EmployeeWithProfile extends Employee {
  profiles: Profile;
}

interface HoursPreview {
  employee_id: string;
  total_hours: number;
}

export default async function HRPayrollPage({
  selectedPeriodId,
  errorMessage,
}: {
  selectedPeriodId?: string;
  errorMessage?: string;
} = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getAdminClient();

  // Active employees with profiles
  const { data: employees } = await admin
    .from("employees")
    .select("*, profiles(first_name, last_name, email)")
    .eq("employment_status", "active")
    .returns<EmployeeWithProfile[]>();

  // All payroll periods
  const { data: periods } = await admin
    .from("payroll_periods")
    .select("*")
    .order("period_start", { ascending: false })
    .returns<PayrollPeriod[]>();

  const activeEmployeeCount = employees?.length ?? 0;
  const payrollProfileIds = Array.from(
    new Set((employees ?? []).map((e) => e.profile_id).filter(Boolean))
  );
  const jobPostingByProfileId = await getJobPostingPositionsByProfileIds(payrollProfileIds);

  // For the most recent draft period, preview hours worked
  const draftPeriod = periods?.find((p) => p.status === "draft") ?? null;
  let hoursPreview: HoursPreview[] = [];

  if (draftPeriod) {
    const { data: logs } = await admin
      .from("time_logs")
      .select("employee_id, total_hours")
      .eq("punch_type", "out")
      .gte("punched_at", `${draftPeriod.period_start}T00:00:00Z`)
      .lte("punched_at", `${draftPeriod.period_end}T23:59:59Z`);

    // Aggregate hours per employee
    const map: Record<string, number> = {};
    for (const log of logs ?? []) {
      map[log.employee_id] = (map[log.employee_id] ?? 0) + (log.total_hours ?? 0);
    }
    hoursPreview = Object.entries(map).map(([employee_id, total_hours]) => ({
      employee_id,
      total_hours: Math.round(total_hours * 100) / 100,
    }));
  }

  // Resolve selected period: explicit URL periodId -> most recent pending_approval -> most recent draft -> period with unpublished slips -> latest period
  let reviewPeriod: PayrollPeriod | null = null;
  if (selectedPeriodId && periods) {
    reviewPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;
  }
  if (!reviewPeriod && periods && periods.length > 0) {
    reviewPeriod =
      periods.find((p) => p.status === "pending_approval") ??
      periods.find((p) => p.status === "draft") ??
      periods[0] ??
      null;
  }

  let reviewPayslips: Payslip[] = [];
  let preRunRoster: Array<{
    employeeId: string;
    name: string;
    role: string;
    baseSalary: number;
    allowancesLabel: string;
    incentivesLabel: string;
    otHours: number;
    nightDiffHours: number;
    lateMinutes: number;
    overbreakMinutes: number;
    absentDays: number;
    isProrated: boolean;
    projectedNet: number;
  }> = [];

  if (reviewPeriod) {
    const [{ data: slips }, { data: periodLogs }, { data: periodLeaves }] = await Promise.all([
      admin
        .from("payslips")
        .select("*, employees(profiles(first_name, last_name))")
        .eq("payroll_period_id", reviewPeriod.id)
        .returns<Payslip[]>(),
      admin
        .from("attendance_logs")
        .select(
          "employee_id, date, clock_in, clock_out, late_minutes, overbreak_minutes, total_lunch_minutes, total_break_minutes"
        )
        .gte("clock_in", `${reviewPeriod.period_start}T00:00:00Z`)
        .lte("clock_in", `${reviewPeriod.period_end}T23:59:59Z`),
      admin
        .from("leave_requests")
        .select("employee_id, start_date, end_date, status")
        .eq("status", "approved")
        .lte("start_date", reviewPeriod.period_end)
        .gte("end_date", reviewPeriod.period_start),
    ]);
    reviewPayslips = slips ?? [];

    const activeEmpList = employees ?? [];
    const offerIds = activeEmpList
      .map((e) => (e as { job_offer_id?: string | null }).job_offer_id)
      .filter((id): id is string => Boolean(id));
    const appIds = activeEmpList
      .map((e) => (e as { application_id?: string | null }).application_id)
      .filter((id): id is string => Boolean(id));

    const offerById = new Map<string, OfferSalarySource>();
    const offerByAppId = new Map<string, OfferSalarySource>();

    if (offerIds.length > 0) {
      const { data: offersById } = await admin
        .from("job_offers")
        .select("id, application_id, salary, financial_package, job_metadata, metadata")
        .in("id", offerIds);
      for (const row of offersById ?? []) {
        offerById.set(row.id, row as OfferSalarySource);
        if (row.application_id && !offerByAppId.has(row.application_id)) {
          offerByAppId.set(row.application_id, row as OfferSalarySource);
        }
      }
    }
    if (appIds.length > 0) {
      const { data: offersByApp } = await admin
        .from("job_offers")
        .select("id, application_id, salary, financial_package, job_metadata, metadata")
        .in("application_id", appIds)
        .order("created_at", { ascending: false });
      for (const row of offersByApp ?? []) {
        if (row.application_id && !offerByAppId.has(row.application_id)) {
          offerByAppId.set(row.application_id, row as OfferSalarySource);
        }
      }
    }

    preRunRoster = activeEmpList.map((emp) => {
      const empRec = emp as unknown as {
        id: string;
        profile_id?: string | null;
        job_title?: string | null;
        base_salary?: number | null;
        salary?: number | null;
        start_date?: string | null;
        hire_date?: string | null;
        pay_frequency?: string | null;
        shift_start?: string | null;
        shift_end?: string | null;
        work_days?: string[] | null;
        monthly_allowance?: number | string | null;
        attendance_incentive?: number | string | null;
        job_offer_id?: string | null;
        application_id?: string | null;
        profiles?: { first_name?: string | null; last_name?: string | null } | null;
      };
      const baseSalary = Number(empRec.base_salary ?? empRec.salary ?? 0);
      const linkedOffer =
        (empRec.job_offer_id ? offerById.get(empRec.job_offer_id) : undefined) ??
        (empRec.application_id ? offerByAppId.get(empRec.application_id) : undefined) ??
        null;
      const comp = resolveOfferCompensation(linkedOffer, null, baseSalary);
      const contractMonthlyAllowance =
        empRec.monthly_allowance !== null &&
        empRec.monthly_allowance !== undefined &&
        Number(empRec.monthly_allowance) > 0
          ? Number(empRec.monthly_allowance)
          : comp.monthlyAllowance;
      const contractAttendanceIncentive =
        empRec.attendance_incentive !== null &&
        empRec.attendance_incentive !== undefined &&
        Number(empRec.attendance_incentive) > 0
          ? Number(empRec.attendance_incentive)
          : comp.attendanceIncentive;

      const contractIncentives =
        comp.itemizedIncentives.length > 0
          ? comp.itemizedIncentives.map((item) => ({
              label: item.label,
              amount: item.amount,
              type:
                item.key === "attendance_incentive"
                  ? ("attendance" as const)
                  : ("performance" as const),
            }))
          : contractAttendanceIncentive > 0
            ? [
                {
                  label: "Perfect Attendance Incentive",
                  amount: contractAttendanceIncentive,
                  type: "attendance" as const,
                },
              ]
            : [];

      const computed = computeEmployeeDemoPayslip({
        monthlyBaseSalary: baseSalary,
        payFrequency: empRec.pay_frequency,
        periodStart: reviewPeriod.period_start,
        periodEnd: reviewPeriod.period_end,
        startDate: empRec.start_date ?? empRec.hire_date ?? null,
        shiftStart: empRec.shift_start,
        shiftEnd: empRec.shift_end,
        workDays: Array.isArray(empRec.work_days) ? empRec.work_days : null,
        attendanceLogs: (periodLogs ?? []).filter((l) => l.employee_id === empRec.id),
        approvedLeaves: (periodLeaves ?? []).filter((lr) => lr.employee_id === empRec.id),
        contractMonthlyAllowance,
        contractAttendanceIncentive,
        contractAllowances: comp.itemizedAllowances,
        contractIncentives,
      });

      const name =
        [empRec.profiles?.first_name, empRec.profiles?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || "Employee";

      const allowancesLabel =
        comp.itemizedAllowances.length > 0
          ? comp.itemizedAllowances.map((a) => `${a.label} ₱${a.amount.toLocaleString()}`).join(", ")
          : contractMonthlyAllowance > 0
            ? `₱${contractMonthlyAllowance.toLocaleString()}/mo`
            : "None";

      const incentivesLabel =
        contractIncentives.length > 0
          ? contractIncentives.map((i) => `${i.label} ₱${i.amount.toLocaleString()}`).join(", ")
          : "None";

      const linkedJob = empRec.profile_id ? jobPostingByProfileId[empRec.profile_id] : undefined;
      return {
        employeeId: empRec.id,
        name,
        role: resolveEmployeePosition({
          employeePosition: empRec.job_title,
          jobTitle: linkedJob?.title,
        }).position,
        baseSalary,
        allowancesLabel,
        incentivesLabel,
        otHours: computed.breakdown.eligibleOtHours,
        nightDiffHours: computed.breakdown.nightDiffHours,
        lateMinutes: computed.breakdown.totalLateMinutes,
        overbreakMinutes: computed.breakdown.totalOverbreakMinutes,
        absentDays: computed.breakdown.unexcusedAbsentDays,
        isProrated: computed.breakdown.isProrated,
        projectedNet: computed.net_pay,
      };
    });
  }

  const unpublishedCount = reviewPayslips.filter((s) => {
    const status = String(s.status);
    return status !== "published" && status !== "paid";
  }).length;
  const showPublishBanner = Boolean(reviewPeriod);

  return (
    <PageContainer>
      <div className="space-y-6">

        {/* Header */}
        <PageHeroHeader
          eyebrow="Payroll & Compensation"
          title="Payroll"
          subtitle="Demo Payroll Computation"
          actions={
            <span className="inline-flex items-center rounded-full border border-indigo-100 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#1E1B4B] shadow-xs backdrop-blur-md">
              {activeEmployeeCount} active employees
            </span>
          }
        />

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-xs">
            <span className="font-semibold">Error:</span>
            <span>{decodeURIComponent(errorMessage)}</span>
          </div>
        )}

        {/* New payroll period form */}
        <SolidSurfaceCard className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-[#1E1B4B]">New payroll period</h2>
          <form action={createPayrollPeriod} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-muted">Period start</label>
                <input
                  type="date" name="period_start" required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary text-text-main bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-muted">Period end</label>
                <input
                  type="date" name="period_end" required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary text-text-main bg-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Pay date</label>
              <input
                type="date" name="pay_date" required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary text-text-main bg-white"
              />
            </div>
            <PayrollSubmitButton
              label="Create period"
              pendingLabel="Creating period..."
              className="w-full rounded-xl bg-[#1E1B4B] py-2.5 text-sm font-medium text-white hover:bg-indigo-900 transition-colors shadow-xs disabled:opacity-60"
            />
          </form>
        </SolidSurfaceCard>

        {/* Hours preview for draft period */}
        {draftPeriod && hoursPreview.length > 0 && (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary-light/50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary-dark">
                Hours logged this period
              </h2>
              <span className="text-xs text-primary-dark/80">
                {new Date(draftPeriod.period_start).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                {" — "}
                {new Date(draftPeriod.period_end).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
              </span>
            </div>
            <div className="space-y-2">
              {hoursPreview.map((h) => {
                const emp = employees?.find((e) => e.id === h.employee_id);
                if (!emp) return null;
                const name = `${emp.profiles.first_name} ${emp.profiles.last_name}`;
                return (
                  <div key={h.employee_id} className="flex items-center justify-between text-sm">
                    <span className="text-primary-dark font-medium">{name}</span>
                    <span className="font-semibold text-primary-dark">{h.total_hours}h</span>
                  </div>
                );
              })}
              {employees
                ?.filter((e) => !hoursPreview.find((h) => h.employee_id === e.id))
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm opacity-50">
                    <span className="text-primary-dark">
                      {e.profiles.first_name} {e.profiles.last_name}
                    </span>
                    <span className="text-primary-dark">0h</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Approve & Publish Payslips Banner + Review */}
        {showPublishBanner && reviewPeriod && (
          <div className="space-y-4 rounded-xl border-2 border-emerald-300 bg-card-bg p-5 shadow-sm">
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-emerald-950">
                    Approve &amp; Publish Payslips
                  </h2>
                  <span className="text-xs font-semibold text-emerald-900">
                    (
                    {new Date(reviewPeriod.period_start).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                    })}
                    {" — "}
                    {new Date(reviewPeriod.period_end).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    )
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[reviewPeriod.status]}`}>
                    {reviewPeriod.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-800">
                  {reviewPayslips.length === 0
                    ? `No payslips generated yet for this period. Click "Generate Payslips" below to compute payslips for ${activeEmployeeCount} active employee(s).`
                    : unpublishedCount > 0
                    ? `${unpublishedCount} of ${reviewPayslips.length} payslip(s) ready to publish for employee access.`
                    : `All ${reviewPayslips.length} payslips published.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reviewPayslips.length > 0 && (
                  <form action={rejectPayroll}>
                    <input type="hidden" name="period_id" value={reviewPeriod.id} />
                    <PayrollSubmitButton
                      label="Reject & revise"
                      pendingLabel="Reverting..."
                      className="rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-bg transition-colors disabled:opacity-60"
                    />
                  </form>
                )}
                <form action={approvePayroll as unknown as (formData: FormData) => Promise<void>}>
                  <input type="hidden" name="period_id" value={reviewPeriod.id} />
                  <PayrollSubmitButton
                    label="Approve & Publish All"
                    pendingLabel="Approving & Publishing..."
                    disabled={reviewPayslips.length === 0}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                  />
                </form>
              </div>
            </div>

            {reviewPayslips.length === 0 && (
              <div className="space-y-4">
                {/* Pre-Run Employee Compensation & Attendance Roster */}
                {preRunRoster.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Pre-Run Employee Compensation &amp; Attendance Roster ({preRunRoster.length})
                      </p>
                      <span className="text-[11px] font-medium text-slate-500">
                        Auto-hydrated from Contracts &amp; Attendance Logs
                      </span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Employee &amp; Role</th>
                          <th className="px-3 py-2.5">Base Salary</th>
                          <th className="px-3 py-2.5">Allowances &amp; Incentives</th>
                          <th className="px-3 py-2.5">Attendance Deltas</th>
                          <th className="px-3 py-2.5 text-right">Est. Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {preRunRoster.map((row) => (
                          <tr key={row.employeeId} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{row.name}</span>
                                {row.isProrated && (
                                  <span className="rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                                    Prorated
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">{row.role}</p>
                            </td>
                            <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
                              ₱{row.baseSalary.toLocaleString()}/mo
                            </td>
                            <td className="px-3 py-2.5 max-w-[240px]">
                              <p className="text-[11px] text-slate-700 truncate" title={row.allowancesLabel}>
                                Allow: {row.allowancesLabel}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate" title={row.incentivesLabel}>
                                Inc: {row.incentivesLabel}
                              </p>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
                                {row.otHours > 0 && (
                                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                                    OT {row.otHours}h
                                  </span>
                                )}
                                {row.nightDiffHours > 0 && (
                                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                    ND {row.nightDiffHours}h
                                  </span>
                                )}
                                {row.lateMinutes > 0 && (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                                    Late {row.lateMinutes}m
                                  </span>
                                )}
                                {row.overbreakMinutes > 0 && (
                                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
                                    Overbreak {row.overbreakMinutes}m
                                  </span>
                                )}
                                {row.absentDays > 0 && (
                                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">
                                    Absent {row.absentDays}d
                                  </span>
                                )}
                                {row.otHours === 0 &&
                                  row.nightDiffHours === 0 &&
                                  row.lateMinutes === 0 &&
                                  row.overbreakMinutes === 0 &&
                                  row.absentDays === 0 && (
                                    <span className="text-slate-400 font-normal">Clean attendance</span>
                                  )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                              ₱{row.projectedNet.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <form action={generatePayslips} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <input type="hidden" name="period_id" value={reviewPeriod.id} />
                  <PayrollSubmitButton
                    label={`Compute & Generate Batch Payslips (${activeEmployeeCount} active employees)`}
                    pendingLabel="Computing & Generating Payslips..."
                    className="w-full rounded-xl bg-[#1e1b4b] py-3 text-xs font-bold text-white hover:bg-[#2d2b68] transition-colors shadow-sm disabled:opacity-60"
                  />
                  <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 hover:text-slate-900 select-none">
                      + Add Optional One-Time Period Adjustment
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                      <input
                        type="number"
                        name="allowances"
                        min="0"
                        step="0.01"
                        placeholder="Allowances (₱)"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                      />
                      <input
                        type="number"
                        name="bonuses"
                        min="0"
                        step="0.01"
                        placeholder="Bonuses (₱)"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                      />
                      <input
                        type="number"
                        name="other_deductions"
                        min="0"
                        step="0.01"
                        placeholder="Other deductions (₱)"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                      />
                      <input
                        type="text"
                        name="remarks"
                        placeholder="Remarks (optional)"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                      />
                    </div>
                  </details>
                </form>
              </div>
            )}

            {/* Summary totals */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-surface-bg border border-border p-2 text-center">
                <p className="text-xs text-text-muted">Total gross</p>
                <p className="text-sm font-semibold text-text-main">
                  ₱{reviewPayslips.reduce((s, p) => s + Number(p.gross_pay), 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-error-bg border border-error/20 p-2 text-center">
                <p className="text-xs text-error">Deductions</p>
                <p className="text-sm font-semibold text-error">
                  -₱{reviewPayslips.reduce((s, p) => s + Number(p.total_deductions), 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-success-bg border border-success/20 p-2 text-center">
                <p className="text-xs text-success">Net payout</p>
                <p className="text-sm font-semibold text-success">
                  ₱{reviewPayslips.reduce((s, p) => s + Number(p.net_pay), 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Per-employee breakdown */}
            <div className="space-y-2">
              {reviewPayslips.map((slip) => {
                const emp = (slip as unknown as {
                  employees: { profiles: { first_name: string; last_name: string } };
                }).employees;
                const name = emp
                  ? `${emp.profiles.first_name} ${emp.profiles.last_name}`
                  : "Employee";
                const slipStatus = String(slip.status);
                const isPublished = slipStatus === "published" || slipStatus === "paid";
                return (
                  <div
                    key={slip.id}
                    className="rounded-lg bg-surface-bg border border-border/60 px-3 py-2.5 text-sm space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-text-main">{name}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isPublished
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isPublished ? "Published" : slip.status.replace("_", " ")}
                          </span>
                        </div>
                        {slip.remarks && (
                          <p className="text-xs text-text-muted mt-0.5">{slip.remarks}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="font-semibold text-success">
                            ₱{Number(slip.net_pay).toLocaleString()}
                          </p>
                          <p className="text-xs text-text-muted">
                            -₱{Number(slip.total_deductions).toLocaleString()} deductions
                          </p>
                        </div>
                        {!isPublished && (
                          <form action={publishSinglePayslip as unknown as (formData: FormData) => Promise<void>}>
                            <input type="hidden" name="payslip_id" value={slip.id} />
                            <PayrollSubmitButton
                              label="Publish"
                              pendingLabel="Publishing..."
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                            />
                          </form>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-border/50 pt-2 text-[11px] text-text-muted">
                      <span>Basic: <strong className="text-text-main">₱{Number(slip.basic_pay).toLocaleString()}</strong></span>
                      <span>OT (1.25x): <strong className="text-text-main">₱{Number(slip.overtime_pay).toLocaleString()}</strong></span>
                      <span>Night Diff / Bonus: <strong className="text-text-main">₱{Number(slip.bonuses).toLocaleString()}</strong></span>
                      <span>Allowances: <strong className="text-text-main">₱{Number(slip.allowances).toLocaleString()}</strong></span>
                      <span>SSS: <strong className="text-text-main">₱{Number(slip.sss_contribution).toLocaleString()}</strong></span>
                      <span>PhilHealth: <strong className="text-text-main">₱{Number(slip.philhealth_contrib).toLocaleString()}</strong></span>
                      <span>Pag-IBIG: <strong className="text-text-main">₱{Number(slip.pagibig_contrib).toLocaleString()}</strong></span>
                      <span>Tax / Late &amp; Abs: <strong className="text-text-main">₱{(Number(slip.withholding_tax) + Number(slip.other_deductions)).toLocaleString()}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All periods history */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-main">History</h2>
          {!periods || periods.length === 0 ? (
            <div className="rounded-xl bg-card-bg border border-dashed border-border p-6 text-center shadow-xs">
              <p className="text-sm text-text-muted">No payroll periods yet</p>
            </div>
          ) : (
            periods.map((period) => {
              const isSelected = reviewPeriod?.id === period.id;
              return (
                <div
                  key={period.id}
                  className={`rounded-xl bg-card-bg border p-4 space-y-3 shadow-xs transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/25"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <Link
                    href={`/hr/payslips?periodId=${period.id}`}
                    className="flex items-start justify-between gap-2 group rounded-lg -m-1 p-1 hover:bg-surface-bg/60 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-main group-hover:text-primary transition-colors">
                        {new Date(period.period_start).toLocaleDateString("en-PH", {
                          month: "short", day: "numeric",
                        })}
                        {" — "}
                        {new Date(period.period_end).toLocaleDateString("en-PH", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Pay date:{" "}
                        {new Date(period.pay_date).toLocaleDateString("en-PH", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[period.status]}`}
                      >
                        {period.status.replace("_", " ")}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </Link>

                  {period.status === "draft" && (
                    <form action={generatePayslips} className="space-y-2.5 pt-1">
                      <input type="hidden" name="period_id" value={period.id} />
                      <PayrollSubmitButton
                        label={`Compute & Generate Batch Payslips (${activeEmployeeCount} active employees)`}
                        pendingLabel="Generating payslips..."
                        className="w-full rounded-xl bg-[#1e1b4b] py-2.5 text-xs font-bold text-white hover:bg-[#2d2b68] transition-colors shadow-xs disabled:opacity-60"
                      />
                      <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                        <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 hover:text-slate-900 select-none">
                          + Add Optional One-Time Period Adjustment
                        </summary>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5">
                          <input
                            type="number"
                            name="allowances"
                            min="0"
                            step="0.01"
                            placeholder="Allowances (₱)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                          />
                          <input
                            type="number"
                            name="bonuses"
                            min="0"
                            step="0.01"
                            placeholder="Bonuses (₱)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                          />
                          <input
                            type="number"
                            name="other_deductions"
                            min="0"
                            step="0.01"
                            placeholder="Other deductions (₱)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                          />
                          <input
                            type="text"
                            name="remarks"
                            placeholder="Remarks (optional)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-purple-500"
                          />
                        </div>
                      </details>
                    </form>
                  )}

                  {(period.status === "paid" || period.status === "approved") && (
                    <p className="text-xs text-success font-medium text-center">
                      ✓ Payslips sent to all employees
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </PageContainer>
  );
}
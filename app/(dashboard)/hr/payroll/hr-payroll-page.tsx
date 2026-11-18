import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { PayrollPeriod, Payslip, Employee, Profile } from "@/lib/types";
import { PAYROLL_STATUS_COLORS } from "@/lib/types";
import {
  createPayrollPeriod,
  generatePayslips,
  approvePayroll,
  publishSinglePayslip,
  rejectPayroll,
} from "./hr-payroll-actions";

interface EmployeeWithProfile extends Employee {
  profiles: Profile;
}

interface HoursPreview {
  employee_id: string;
  total_hours: number;
}

export default async function HRPayrollPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Active employees with profiles
  const { data: employees } = await supabase
    .from("employees")
    .select("*, profiles(first_name, last_name, email)")
    .eq("employment_status", "active")
    .returns<EmployeeWithProfile[]>();

  // All payroll periods
  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("period_start", { ascending: false })
    .returns<PayrollPeriod[]>();

  const activeEmployeeCount = employees?.length ?? 0;

  // For the most recent draft period, preview hours worked
  const draftPeriod = periods?.find((p) => p.status === "draft") ?? null;
  let hoursPreview: HoursPreview[] = [];

  if (draftPeriod) {
    const { data: logs } = await supabase
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

  // Load payslips for pending_approval period, or any period that still has unpublished payslips
  let reviewPeriod: PayrollPeriod | null =
    periods?.find((p) => p.status === "pending_approval") ?? null;
  let reviewPayslips: Payslip[] = [];

  if (reviewPeriod) {
    const { data: slips } = await supabase
      .from("payslips")
      .select("*, employees(profiles(first_name, last_name))")
      .eq("payroll_period_id", reviewPeriod.id)
      .returns<Payslip[]>();
    reviewPayslips = slips ?? [];
  } else if (periods && periods.length > 0) {
    const { data: unpublishedSlips } = await supabase
      .from("payslips")
      .select("*, employees(profiles(first_name, last_name))")
      .in("payroll_period_id", periods.map((p) => p.id))
      .not("status", "in", '("published","paid")')
      .returns<Payslip[]>();

    if (unpublishedSlips && unpublishedSlips.length > 0) {
      const targetPeriodId = unpublishedSlips[0].payroll_period_id;
      reviewPeriod = periods.find((p) => p.id === targetPeriodId) ?? null;
      if (reviewPeriod) {
        const { data: slips } = await supabase
          .from("payslips")
          .select("*, employees(profiles(first_name, last_name))")
          .eq("payroll_period_id", reviewPeriod.id)
          .returns<Payslip[]>();
        reviewPayslips = slips ?? [];
      }
    }
  }

  const unpublishedCount = reviewPayslips.filter((s) => {
    const status = String(s.status);
    return status !== "published" && status !== "paid";
  }).length;
  const showPublishBanner = Boolean(
    reviewPeriod &&
      (reviewPeriod.status === "draft" ||
        reviewPeriod.status === "pending_approval" ||
        unpublishedCount > 0) &&
      reviewPayslips.length > 0
  );

  return (
    <PageContainer>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-5">
          <div>
            <h1 className="font-h1 text-2xl font-bold text-text-main">
              Payroll
            </h1>
            <p className="mt-1 text-xs font-medium text-amber-700">
              Demo Payroll Computation
            </p>
          </div>
          <span className="text-xs text-text-muted">
            {activeEmployeeCount} active employees
          </span>
        </div>

        {/* New payroll period form */}
        <div className="space-y-4 rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text-main">New payroll period</h2>
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
            <button
              type="submit"
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors shadow-xs"
            >
              Create period
            </button>
          </form>
        </div>

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
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-emerald-950">
                    Approve &amp; Publish Payslips
                  </h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[reviewPeriod.status]}`}>
                    {reviewPeriod.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-800">
                  {unpublishedCount > 0
                    ? `${unpublishedCount} of ${reviewPayslips.length} payslip(s) ready to publish for employee access.`
                    : `All ${reviewPayslips.length} payslips published.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action={rejectPayroll}>
                  <input type="hidden" name="period_id" value={reviewPeriod.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-bg transition-colors"
                  >
                    Reject &amp; revise
                  </button>
                </form>
                <form action={approvePayroll}>
                  <input type="hidden" name="period_id" value={reviewPeriod.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    Approve &amp; Publish All
                  </button>
                </form>
              </div>
            </div>

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
                            <button
                              type="submit"
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                            >
                              Publish
                            </button>
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
            periods.map((period) => (
              <div
                key={period.id}
                className="rounded-xl bg-card-bg border border-border p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-main">
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
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[period.status]}`}
                  >
                    {period.status.replace("_", " ")}
                  </span>
                </div>

                {period.status === "draft" && (
                  <form action={generatePayslips} className="space-y-3 pt-1">
                    <input type="hidden" name="period_id" value={period.id} />
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Demo Payroll Computation (non-statutory) — Optional Adjustments
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-primary py-2 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-xs"
                    >
                      Generate payslips for {activeEmployeeCount} employees
                    </button>
                  </form>
                )}

                {period.status === "paid" && (
                  <p className="text-xs text-success font-medium text-center">
                    ✓ Payslips sent to all employees
                  </p>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </PageContainer>
  );
}
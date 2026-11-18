import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
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
import { PayrollSubmitButton } from "./payroll-submit-button";

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
  if (reviewPeriod) {
    const { data: slips } = await admin
      .from("payslips")
      .select("*, employees(profiles(first_name, last_name))")
      .eq("payroll_period_id", reviewPeriod.id)
      .returns<Payslip[]>();
    reviewPayslips = slips ?? [];
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

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-xs">
            <span className="font-semibold">Error:</span>
            <span>{decodeURIComponent(errorMessage)}</span>
          </div>
        )}

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
            <PayrollSubmitButton
              label="Create period"
              pendingLabel="Creating period..."
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-60"
            />
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
              <form action={generatePayslips} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <input type="hidden" name="period_id" value={reviewPeriod.id} />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Generate Payslips for Selected Period — Optional Adjustments
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
                <PayrollSubmitButton
                  label={`Generate Payslips (${activeEmployeeCount} active employees)`}
                  pendingLabel="Generating Payslips..."
                  className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-white hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-60"
                />
              </form>
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
                      <PayrollSubmitButton
                        label={`Generate payslips for ${activeEmployeeCount} employees`}
                        pendingLabel="Generating payslips..."
                        className="w-full rounded-lg bg-primary py-2 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-60"
                      />
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
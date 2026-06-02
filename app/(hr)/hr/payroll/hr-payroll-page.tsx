import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { PayrollPeriod, Payslip, Employee, Profile } from "@/lib/types";
import { PAYROLL_STATUS_COLORS } from "@/lib/types";
import {
  createPayrollPeriod,
  generatePayslips,
  approvePayroll,
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

  // For pending_approval period, load the generated payslips
  const pendingPeriod = periods?.find((p) => p.status === "pending_approval") ?? null;
  let pendingPayslips: Payslip[] = [];

  if (pendingPeriod) {
    const { data: slips } = await supabase
      .from("payslips")
      .select("*, employees(profiles(first_name, last_name))")
      .eq("payroll_period_id", pendingPeriod.id)
      .returns<Payslip[]>();
    pendingPayslips = slips ?? [];
  }

  return (
    <PageContainer>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Payroll
          </h1>
          <span className="text-xs text-text-secondary">
            {activeEmployeeCount} active employees
          </span>
        </div>

        {/* New payroll period form */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">New payroll period</h2>
          <form action={createPayrollPeriod} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Period start</label>
                <input
                  type="date" name="period_start" required
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Period end</label>
                <input
                  type="date" name="period_end" required
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">Pay date</label>
              <input
                type="date" name="pay_date" required
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              Create period
            </button>
          </form>
        </div>

        {/* Hours preview for draft period */}
        {draftPeriod && hoursPreview.length > 0 && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-blue-800">
                Hours logged this period
              </h2>
              <span className="text-xs text-blue-600">
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
                    <span className="text-blue-800">{name}</span>
                    <span className="font-semibold text-blue-700">{h.total_hours}h</span>
                  </div>
                );
              })}
              {employees
                ?.filter((e) => !hoursPreview.find((h) => h.employee_id === e.id))
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm opacity-50">
                    <span className="text-blue-800">
                      {e.profiles.first_name} {e.profiles.last_name}
                    </span>
                    <span className="text-blue-600">0h</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Payslip review for pending_approval period */}
        {pendingPeriod && pendingPayslips.length > 0 && (
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Review payslips</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS["pending_approval"]}`}>
                pending approval
              </span>
            </div>

            {/* Summary totals */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 p-2 text-center">
                <p className="text-xs text-text-tertiary">Total gross</p>
                <p className="text-sm font-semibold text-text-primary">
                  ₱{pendingPayslips.reduce((s, p) => s + Number(p.gross_pay), 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-2 text-center">
                <p className="text-xs text-red-400">Deductions</p>
                <p className="text-sm font-semibold text-red-600">
                  -₱{pendingPayslips.reduce((s, p) => s + Number(p.total_deductions), 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-green-50 p-2 text-center">
                <p className="text-xs text-green-600">Net payout</p>
                <p className="text-sm font-semibold text-green-700">
                  ₱{pendingPayslips.reduce((s, p) => s + Number(p.net_pay), 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Per-employee breakdown */}
            <div className="space-y-2">
              {pendingPayslips.map((slip) => {
                const emp = (slip as unknown as {
                  employees: { profiles: { first_name: string; last_name: string } };
                }).employees;
                const name = emp
                  ? `${emp.profiles.first_name} ${emp.profiles.last_name}`
                  : "Employee";
                return (
                  <div
                    key={slip.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{name}</p>
                      {slip.remarks && (
                        <p className="text-xs text-text-tertiary mt-0.5">{slip.remarks}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-700">
                        ₱{Number(slip.net_pay).toLocaleString()}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        -₱{Number(slip.total_deductions).toLocaleString()} deductions
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Approve / Reject */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <form action={rejectPayroll}>
                <input type="hidden" name="period_id" value={pendingPeriod.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-border py-2 text-xs font-medium text-text-secondary hover:bg-gray-50 transition-colors"
                >
                  Reject & revise
                </button>
              </form>
              <form action={approvePayroll}>
                <input type="hidden" name="period_id" value={pendingPeriod.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-green-500 py-2 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                >
                  Approve & pay
                </button>
              </form>
            </div>
          </div>
        )}

        {/* All periods history */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">History</h2>
          {!periods || periods.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-6 text-center">
              <p className="text-sm text-text-secondary">No payroll periods yet</p>
            </div>
          ) : (
            periods.map((period) => (
              <div
                key={period.id}
                className="rounded-2xl bg-surface border border-border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {new Date(period.period_start).toLocaleDateString("en-PH", {
                        month: "short", day: "numeric",
                      })}
                      {" — "}
                      {new Date(period.period_end).toLocaleDateString("en-PH", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">
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
                  <form action={generatePayslips}>
                    <input type="hidden" name="period_id" value={period.id} />
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-blue-500 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
                    >
                      Generate payslips for {activeEmployeeCount} employees
                    </button>
                  </form>
                )}

                {period.status === "paid" && (
                  <p className="text-xs text-green-600 font-medium text-center">
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
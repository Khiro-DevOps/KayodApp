import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile, PayrollPeriod } from "@/lib/types";
import { PAYROLL_STATUS_COLORS } from "@/lib/types";
import { createPayrollPeriod, generatePayslips, approvePayroll } from "./actions";

export default async function PayrollPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  // Employees see their own payslips
  if (!isHR) {
    const { data: employee } = await supabase
      .from("employees").select("id").eq("profile_id", user.id).single();

    if (!employee) redirect("/dashboard");

    const { data: payslips } = await supabase
      .from("payslips")
      .select("*, payroll_periods(*)")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });

    return (
      <PageContainer>
        <div className="space-y-5">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            My payslips
          </h1>
          {!payslips || payslips.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-6 text-center">
              <p className="text-sm text-text-secondary">No payslips yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payslips.map((slip) => {
                const period = slip.payroll_periods as unknown as { period_start: string; period_end: string } | null;
                return (
                  <div key={slip.id} className="rounded-2xl bg-surface border border-border p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {period
                            ? `${new Date(period.period_start).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} — ${new Date(period.period_end).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
                            : "Payslip"}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          Net pay: <span className="font-semibold text-green-700">₱{Number(slip.net_pay).toLocaleString()}</span>
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[slip.status]}`}>
                        {slip.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl bg-gray-50 p-2 text-center">
                        <p className="text-text-tertiary">Basic</p>
                        <p className="font-medium text-text-primary">₱{Number(slip.basic_pay).toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-2 text-center">
                        <p className="text-text-tertiary">Gross</p>
                        <p className="font-medium text-text-primary">₱{Number(slip.gross_pay).toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-red-50 p-2 text-center">
                        <p className="text-red-400">Deductions</p>
                        <p className="font-medium text-red-600">-₱{Number(slip.total_deductions).toLocaleString()}</p>
                      </div>
                    </div>
                    {slip.pdf_url && (
                      <a href={slip.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-gray-50">
                        Download PDF
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageContainer>
    );
  }

  // HR view
  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("period_start", { ascending: false });

  const { data: employees } = await supabase
    .from("employees")
    .select("id, job_title, base_salary, profiles(first_name, last_name)")
    .eq("employment_status", "active");

  const activeEmployeeCount = employees?.length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Payroll
          </h1>
          <span className="text-xs text-text-secondary">{activeEmployeeCount} active employees</span>
        </div>

        {/* Create new payroll period form */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">New payroll period</h2>
          <form action={createPayrollPeriod} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Period start</label>
                <input type="date" name="period_start" required
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Period end</label>
                <input type="date" name="period_end" required
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">Pay date</label>
              <input type="date" name="pay_date" required
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <button type="submit"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
              Create period
            </button>
          </form>
        </div>

        {/* Payroll periods list */}
        <div className="space-y-3">
          {!periods || periods.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-6 text-center">
              <p className="text-sm text-text-secondary">No payroll periods yet</p>
            </div>
          ) : (
            (periods as PayrollPeriod[]).map((period) => (
              <div key={period.id} className="rounded-2xl bg-surface border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {new Date(period.period_start).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      {" — "}
                      {new Date(period.period_end).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Pay date: {new Date(period.pay_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[period.status]}`}>
                    {period.status.replace("_", " ")}
                  </span>
                </div>

                {/* Actions per status */}
                {period.status === "draft" && (
                  <form action={generatePayslips}>
                    <input type="hidden" name="period_id" value={period.id} />
                    <button type="submit"
                      className="w-full rounded-xl bg-blue-500 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors">
                      Generate payslips for {activeEmployeeCount} employees
                    </button>
                  </form>
                )}
                {period.status === "pending_approval" && (
                  <form action={approvePayroll}>
                    <input type="hidden" name="period_id" value={period.id} />
                    <button type="submit"
                      className="w-full rounded-xl bg-green-500 py-2 text-xs font-medium text-white hover:bg-green-600 transition-colors">
                      Approve and mark as paid
                    </button>
                  </form>
                )}
                {period.status === "paid" && (
                  <p className="text-xs text-green-600 font-medium text-center">
                    Payslips sent to all employees
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

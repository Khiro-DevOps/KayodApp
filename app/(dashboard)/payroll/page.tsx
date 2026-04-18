// ============================================================
// SAVE THIS FILE AS: app/(dashboard)/payroll/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { PayrollPeriod, Payslip, Profile } from "@/lib/types";
import { PAYROLL_STATUS_COLORS } from "@/lib/types";
import Link from "next/link";

export default async function PayrollPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Profile>();

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
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">My payslips</h1>
          </div>
          <div className="space-y-3">
            {!payslips || payslips.length === 0 ? (
              <div className="rounded-2xl bg-surface border border-border p-6 text-center">
                <p className="text-sm text-text-secondary">No payslips yet</p>
              </div>
            ) : (
              (payslips as Payslip[]).map((slip) => (
                <PayslipCard key={slip.id} slip={slip} />
              ))
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  // HR view — payroll periods
  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("period_start", { ascending: false });

  const { count: employeeCount } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("employment_status", "active");

  return (
    <PageContainer>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">Payroll</h1>
          </div>
          <Link href="/payroll/new" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
            New period
          </Link>
        </div>

        <div className="rounded-2xl bg-surface border border-border p-4 flex items-center justify-between">
          <p className="text-sm text-text-secondary">Active employees</p>
          <p className="text-lg font-bold text-text-primary">{employeeCount ?? 0}</p>
        </div>

        <div className="space-y-3">
          {!periods || periods.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
              <p className="text-sm text-text-secondary">No payroll periods yet</p>
              <p className="text-xs text-text-secondary">Click &quot;New period&quot; to create your first payroll run</p>
            </div>
          ) : (
            (periods as PayrollPeriod[]).map((period) => (
              <PayrollPeriodCard key={period.id} period={period} />
            ))
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function PayrollPeriodCard({ period }: { period: PayrollPeriod }) {
  return (
    <Link
      href={`/payroll/${period.id}`}
      className="block rounded-2xl bg-surface border border-border p-4 space-y-2 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {new Date(period.period_start).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
            {" — "}
            {new Date(period.period_end).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Pay date: {new Date(period.pay_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[period.status]}`}>
          {period.status.replace("_", " ")}
        </span>
      </div>
    </Link>
  );
}

function PayslipCard({ slip }: { slip: Payslip }) {
  const period = slip.payroll_periods as unknown as {
    period_start: string;
    period_end: string;
  };

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {period
              ? `${new Date(period.period_start).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} — ${new Date(period.period_end).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
              : "Payslip"}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Net pay: <span className="font-semibold text-green-700">₱{slip.net_pay.toLocaleString()}</span>
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYROLL_STATUS_COLORS[slip.status]}`}>
          {slip.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
        <div>
          <p className="text-text-tertiary">Gross pay</p>
          <p className="font-medium text-text-primary">₱{slip.gross_pay.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-tertiary">Deductions</p>
          <p className="font-medium text-red-600">-₱{slip.total_deductions.toLocaleString()}</p>
        </div>
      </div>

      {slip.pdf_url && (
        <a
          href={slip.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-gray-50 transition-colors"
        >
          Download PDF
        </a>
      )}
    </div>
  );
}

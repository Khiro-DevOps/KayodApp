import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Palmtree, Banknote, Calendar } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import PageContainer from "@/components/ui/page-container";
import type { LeaveBalance, LeaveRequest, Payslip, Profile, TimeLog } from "@/lib/types";
import { LEAVE_STATUS_COLORS, PAYROLL_STATUS_COLORS } from "@/lib/types";

type EmployeePayslip = Payslip & {
  payroll_periods?: {
    period_start: string;
    period_end: string;
    pay_date: string;
    status: string;
  } | null;
};

function formatPeso(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function EmployeeDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "first_name" | "last_name">>();

  if (!profile || profile.role !== "employee") redirect("/applicant/dashboard");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .single();

  if (!employee) redirect("/applicant/dashboard");

  const [balanceResult, payslipResult, leaveResult, timeLogResult] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("id, leave_type, year, total_credits, used_credits, remaining, updated_at")
      .eq("employee_id", employee.id)
      .order("year", { ascending: false })
      .returns<LeaveBalance[]>(),
    supabase
      .from("payslips")
      .select("*, payroll_periods(*)")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("leave_requests")
      .select("id, leave_type, status, start_date, end_date, total_days, filed_at")
      .eq("employee_id", employee.id)
      .order("filed_at", { ascending: false })
      .limit(3)
      .returns<LeaveRequest[]>(),
    supabase
      .from("time_logs")
      .select("id, punch_type, punched_at, total_hours")
      .eq("employee_id", employee.id)
      .order("punched_at", { ascending: false })
      .limit(3)
      .returns<TimeLog[]>(),
  ]);

  const balances = balanceResult.data ?? [];
  const latestPayslip = (payslipResult.data as EmployeePayslip | null) ?? null;
  const recentLeaves = leaveResult.data ?? [];
  const recentTimeLogs = timeLogResult.data ?? [];

  const totalLeaveRemaining = balances.reduce((sum, balance) => sum + balance.remaining, 0);
  const latestTimeLog = recentTimeLogs[0] ?? null;
  const firstName = profile.first_name || "there";
  const todayLabel = formatLongDate(new Date().toISOString());

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 font-sans">
            Hello, {firstName}
          </h1>
          <p className="text-xs text-text-secondary">{todayLabel}</p>
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <SurfaceCard>
              <div className="flex items-center justify-between">
                <CardLabel>LEAVE BALANCE</CardLabel>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center w-10 h-10 shrink-0">
                  <Palmtree className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-text-primary">{totalLeaveRemaining}</p>
                  <p className="mt-1 text-sm text-text-secondary">days remaining across your balance types</p>
                </div>
                <span className="rounded-full bg-[#E9E5FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d2b68]">
                  {balances.length > 0 ? `${balances.length} types` : "No record"}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {balances.length > 0 ? (
                  balances.map((balance) => (
                    <span
                      key={balance.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[#e6e4f0] bg-[#f7f6fc] px-3 py-1.5 text-xs font-medium text-text-secondary"
                    >
                      <span className="capitalize">{balance.leave_type.replace("_", " ")}</span>
                      <span className="text-text-primary">{balance.remaining}</span>
                    </span>
                  ))
                ) : (
                  <div className="w-full flex items-center justify-between">
                    <p className="text-sm text-text-secondary">No leave balance record is available yet.</p>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">0 Days</span>
                  </div>
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-center justify-between">
                <CardLabel>NEXT PAYSLIP</CardLabel>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center w-10 h-10 shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
              </div>
              {latestPayslip?.payroll_periods ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-text-primary">
                        {formatShortDate(latestPayslip.payroll_periods.pay_date)}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {formatShortDate(latestPayslip.payroll_periods.period_start)} to {formatShortDate(latestPayslip.payroll_periods.period_end)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${PAYROLL_STATUS_COLORS[latestPayslip.status]}`}>
                      {latestPayslip.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-[#e6e4f0] bg-[#f7f6fc] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Net pay</p>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">{formatPeso(Number(latestPayslip.net_pay))}</p>
                    <p className="mt-1 text-sm text-text-secondary">Payroll processed by HR and saved to your record.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 bg-gradient-to-br from-gray-50 to-purple-50/30 border border-gray-100 rounded-2xl p-4 text-sm text-text-secondary">
                  No payslip has been generated yet.
                </div>
              )}
            </SurfaceCard>
          </div>

          <div className="grid gap-4">
            <SurfaceCard>
              <CardLabel>NEED HELP</CardLabel>
              <div className="mt-4 space-y-3">
                <p className="text-sm leading-6 text-text-secondary">
                  If a leave balance or payslip looks wrong, review the relevant record first and contact HR from your profile if you still need help.
                </p>
                <Link
                  href="/employee/profile"
                  className="inline-flex items-center gap-2 rounded-full bg-[#2d2b68] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2A2375] transition-all shadow-sm active:scale-[0.98]"
                >
                  Open profile
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <CardLabel>UPCOMING MEETING</CardLabel>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[#e6e4f0] bg-[#fbfaff] px-4 py-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E9E5FF] text-[#2d2b68]">
                    <span className="material-symbols-outlined text-[22px]">event</span>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">No meeting feed connected yet</p>
                    <p className="text-sm text-text-secondary">Use Schedule for shifts and attendance updates while meeting data is unavailable.</p>
                  </div>
                </div>

                <Link
                  href="/employee/schedule"
                  className="inline-flex items-center gap-2 rounded-full border border-[#e6e4f0] px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-[#2A2375] hover:text-white transition-all shadow-sm active:scale-[0.98]"
                >
                  View schedule
                  <span className="material-symbols-outlined text-[18px]">north_east</span>
                </Link>
              </div>
            </SurfaceCard>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <SurfaceCard>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardLabel>Quick Actions</CardLabel>
                <p className="mt-1 text-sm text-text-secondary">Move straight to the most common employee tasks.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ActionTile href="/employee/leaves/new" icon="event_available" title="File leave" subtitle="Start a request" />
              <ActionTile href="/employee/payslips" icon="payments" title="View payslip" subtitle="My statements" />
              <ActionTile href="/employee/profile" icon="person" title="My profile" subtitle="Update details" />
              <ActionTile
                href="/employee/schedule"
                icon="history"
                title="Time history"
                subtitle={latestTimeLog ? `${latestTimeLog.punch_type === "in" ? "Clocked in" : "Clocked out"} ${new Date(latestTimeLog.punched_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : "Attendance view"}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardLabel>Recent Activity</CardLabel>
                <p className="mt-1 text-sm text-text-secondary">Latest leave requests from your record.</p>
              </div>
              <Link href="/employee/leaves" className="text-sm font-medium text-[#2d2b68] transition-colors hover:text-[#4a4880]">
                View all
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {recentLeaves.length > 0 ? (
                recentLeaves.map((leave) => (
                  <div
                    key={leave.id}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-[#e6e4f0] bg-[#fbfaff] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary capitalize">
                        {leave.leave_type.replace("_", " ")} leave
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {formatShortDate(leave.start_date)} to {formatShortDate(leave.end_date)} · {leave.total_days} day{leave.total_days !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${LEAVE_STATUS_COLORS[leave.status]}`}>
                      {leave.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e6e4f0] bg-[#fbfaff] px-4 py-6 text-sm text-text-secondary">
                  No leave requests yet.
                </div>
              )}
            </div>
          </SurfaceCard>
        </section>
      </div>
    </PageContainer>
  );
}

function SurfaceCard({ children }: { children: ReactNode }) {
  return <div className="rounded-[28px] border border-[#e6e4f0] bg-white p-5 shadow-[0_12px_30px_rgba(39,36,84,0.08)]">{children}</div>;
}

function CardLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">{children}</p>;
}

function ActionTile({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-3xl border border-[#e6e4f0] bg-[#fbfaff] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#cfcaf8] hover:bg-white"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E9E5FF] text-[#2d2b68] transition-transform group-hover:scale-105">
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </span>
      <div className="mt-4 space-y-1">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{subtitle}</p>
      </div>
    </Link>
  );
}

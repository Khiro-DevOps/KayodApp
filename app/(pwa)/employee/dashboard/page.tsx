import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Palmtree, Banknote, Calendar, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { getNteCountdown } from "@/lib/incident-reports";

import { getEmployeeOnboardingProgress } from "@/app/actions/onboarding-documents";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import {
  formatDailyWorkModelLabel,
  resolveDailyWorkModel,
  resolveEmployeeSourceOfTruth,
} from "@/lib/work-arrangement";
import PageContainer from "@/components/ui/page-container";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
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

export default async function EmployeeDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const showWelcome = resolvedSearchParams.welcome === "1";
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

  if (profile && profile.role !== "employee") redirect("/applicant/dashboard");

  const admin = getAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id, job_title, work_mode, work_days, departments(name)")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .maybeSingle();

  if (!employee) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-lg font-semibold">Employee profile unavailable</h1>
          <p className="mt-2 text-sm">
            Your employee profile is not active yet. Please contact HR for assistance.
          </p>
        </div>
      </PageContainer>
    );
  }

  const currentYear = new Date().getFullYear();
  const [ledgerBalanceResult, balanceResult, payslipResult, leaveResult, timeLogResult, onboardingResult, linkedJob, latestScheduleResult, openNteResult] = await Promise.all([
    admin
      .from("employee_leave_balances")
      .select("id, leave_type, year, entitled_days, used_days, pending_days, eligibility, is_active")
      .eq("employee_id", employee.id)
      .eq("year", currentYear)
      .eq("is_active", true),
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
    getEmployeeOnboardingProgress(employee.id),
    getJobPostingPositionForProfile(user.id),
    admin
      .from("schedules")
      .select("notes")
      .eq("employee_id", employee.id)
      .eq("is_published", true)
      .order("week_start", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("incident_reports")
      .select("id, case_number, offense_category, nte_deadline_at")
      .eq("employee_id", employee.id)
      .eq("status", "nte_issued")
      .order("nte_deadline_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        case_number: string;
        offense_category: string;
        nte_deadline_at: string | null;
      }>(),
  ]);

  const sourceOfTruth = resolveEmployeeSourceOfTruth({
    employee: {
      job_title: employee.job_title,
      departments: employee.departments as { name?: string | null } | Array<{ name?: string | null }> | null,
      work_mode: employee.work_mode,
    },
    offer: linkedJob
      ? {
          job_title: linkedJob.offerTitle,
          work_setup: linkedJob.offerWorkSetup,
        }
      : null,
    jobPosting: linkedJob
      ? {
          title: linkedJob.title,
          department: linkedJob.departmentName,
          work_setup: linkedJob.jobWorkSetup,
        }
      : null,
  });

  const todayWorkModel = resolveDailyWorkModel({
    contractWorkSetup: sourceOfTruth.workSetup,
    schedule: {
      notes: latestScheduleResult.data?.notes ?? null,
      work_days: Array.isArray(employee.work_days) ? employee.work_days : null,
    },
  });

  const onboardingProgress = onboardingResult.success ? onboardingResult.data ?? null : null;

  const ledgerBalances = (ledgerBalanceResult.data ?? []) as Array<{
    id: string;
    leave_type: string;
    year: number;
    entitled_days: number;
    used_days: number;
    pending_days: number;
    eligibility: string;
  }>;
  const balances = balanceResult.data ?? [];
  const latestPayslip = (payslipResult.data as EmployeePayslip | null) ?? null;
  const recentLeaves = leaveResult.data ?? [];
  const recentTimeLogs = timeLogResult.data ?? [];

  const totalLeaveRemaining =
    ledgerBalances.length > 0
      ? ledgerBalances.reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              Number(row.entitled_days ?? 0) -
                Number(row.used_days ?? 0) -
                Number(row.pending_days ?? 0)
            ),
          0
        )
      : balances.reduce((sum, balance) => sum + balance.remaining, 0);
  const latestTimeLog = recentTimeLogs[0] ?? null;
  const firstName = profile?.first_name || "there";
  const todayLabel = formatLongDate(new Date().toISOString());

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          eyebrow="Welcome back,"
          title={`Hello, ${firstName}`}
          subtitle={todayLabel}
          badge={
            <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/15 px-3.5 py-1 text-xs font-semibold text-white">
              {sourceOfTruth.position} · {sourceOfTruth.department} · Work Setup: {sourceOfTruth.workSetupLabel} · Today&apos;s Work Model: {formatDailyWorkModelLabel(todayWorkModel)}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Leave Credits</p>
              <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{totalLeaveRemaining}d</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Recent Logs</p>
              <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{recentTimeLogs.length}</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Latest Net Pay</p>
              <p className="mt-1 truncate text-base font-bold text-[#1E1B4B] sm:text-lg">
                {latestPayslip ? `₱${Number(latestPayslip.net_pay).toLocaleString("en-PH")}` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Last Activity</p>
              <p className="mt-1 truncate text-sm font-bold text-[#1E1B4B]">
                {latestTimeLog ? latestTimeLog.punch_type.replace(/_/g, " ") : "No logs yet"}
              </p>
            </div>
          </div>
        </PwaHeroBanner>

        <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 sm:px-6 lg:px-10">

        {openNteResult.data && (() => {
          const openNte = openNteResult.data;
          const countdown = getNteCountdown(openNte.nte_deadline_at);
          return (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E1B4B] text-amber-300">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#1E1B4B]">
                    Action Required · Notice to Explain ({openNte.case_number})
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {openNte.offense_category} — {countdown.label}
                  </p>
                </div>
              </div>
              <Link
                href={`/employee/notices?case=${openNte.id}`}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#2d2b68]"
              >
                Respond Now
              </Link>
            </div>
          );
        })()}

        {showWelcome && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-medium text-emerald-900 shadow-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>Welcome to the team! Your employee workspace is now active.</span>
          </div>
        )}

        {onboardingProgress && onboardingProgress.totalRequirements > 0 && (
          <SurfaceCard>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardLabel>PRE-EMPLOYMENT REQUIREMENTS</CardLabel>
                  <p className="mt-1 text-sm font-semibold text-text-primary">
                    {onboardingProgress.approvedCount}/{onboardingProgress.totalRequirements} verified
                    <span className="ml-2 text-xs font-normal text-text-secondary">
                      ({onboardingProgress.counts.submitted} submitted · {onboardingProgress.counts.pending + onboardingProgress.counts.rejected} remaining)
                    </span>
                  </p>
                </div>
              </div>
              <Link
                href="/employee/onboarding"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2d2b68] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#2A2375] active:scale-[0.98]"
              >
                {onboardingProgress.approvedCount < onboardingProgress.totalRequirements
                  ? "Complete Pre-Employment Requirements"
                  : "View Onboarding Documents"}
              </Link>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#e9e5ff]">
              <div
                className="h-full rounded-full bg-[#2d2b68] transition-all duration-300"
                style={{ width: `${onboardingProgress.completionPercentage}%` }}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {onboardingProgress.items.slice(0, 4).map((item) => {
                const badge =
                  item.status === "approved"
                    ? { label: "Verified", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                    : item.status === "submitted"
                      ? { label: "Submitted", className: "bg-sky-50 text-sky-700 border-sky-200" }
                      : item.status === "rejected"
                        ? { label: "Action Required", className: "bg-red-50 text-red-700 border-red-200" }
                        : { label: "Missing", className: "bg-amber-50 text-amber-700 border-amber-200" };

                return (
                  <div
                    key={item.requirement.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#e6e4f0] bg-[#fbfaff] px-3 py-2.5"
                  >
                    <span className="truncate text-sm font-medium text-text-primary">
                      {item.requirement.document_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        )}

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

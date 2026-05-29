import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { InterviewType, Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole } from "@/lib/roles";
import EmployeeDashboardPage from "./employee-dashboard-page";
import { isActiveInterview } from "@/lib/interviews";

interface CandidateUpcomingInterview {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: InterviewType;
  job_title: string;
  location_address: string | null;
  location_notes: string | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole      = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  const authFirstName = (user.user_metadata?.first_name ?? rawMetadata.first_name) as string | undefined;
  const authLastName  = (user.user_metadata?.last_name ?? rawMetadata.last_name) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const role = effectiveRole(profile?.role, authRole);

  // ── Employee → dedicated calendar dashboard ──────────────
  if (role === "employee") {
    return <EmployeeDashboardPage />;
  }

  // ── HR / Admin ────────────────────────────────────────────
  let stats: Record<string, number> = {};
  let upcomingInterview: CandidateUpcomingInterview | null = null;

  if (role === "hr_manager" || role === "admin") {
    const [
      { count: jobCount },
      { count: applicantCount },
      { count: interviewCount },
      { count: employeeCount },
      { count: leaveCount },
    ] = await Promise.all([
      supabase.from("job_postings").select("*", { count: "exact", head: true }).eq("is_published", true),
      supabase.from("applications").select("*", { count: "exact", head: true }),
      supabase.from("interviews").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
      supabase.from("employees").select("*", { count: "exact", head: true }).eq("employment_status", "active"),
      supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    stats = {
      jobs:         jobCount ?? 0,
      applicants:   applicantCount ?? 0,
      interviews:   interviewCount ?? 0,
      employees:    employeeCount ?? 0,
      pendingLeaves: leaveCount ?? 0,
    };
  } else {
    // ── Candidate ─────────────────────────────────────────
    const [
      { count: appCount },
      { count: interviewCount },
      { data: candidateInterviews },
    ] = await Promise.all([
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("candidate_id", user.id),
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("candidate_id", user.id).eq("status", "interview_scheduled"),
      supabase
        .from("interviews")
        .select(`id, scheduled_at, duration_minutes, interview_type, status, location_address, location_notes, applications!inner(candidate_id, job_postings(title))`)
        .eq("applications.candidate_id", user.id)
        .in("status", ["scheduled", "confirmed", "rescheduled"])
        .order("scheduled_at", { ascending: true }),
    ]);

    const nextInterview = (candidateInterviews ?? []).find((interview) => isActiveInterview(interview));

    if (nextInterview) {
      const app = nextInterview.applications as unknown as { job_postings?: { title?: string }[] };
      upcomingInterview = {
        id:               nextInterview.id,
        scheduled_at:     nextInterview.scheduled_at,
        duration_minutes: nextInterview.duration_minutes,
        interview_type:   nextInterview.interview_type,
        job_title:        app?.job_postings?.[0]?.title ?? "Interview",
        location_address: nextInterview.location_address ?? null,
        location_notes:   nextInterview.location_notes ?? null,
      };
    }

    stats = { applications: appCount ?? 0, interviews: interviewCount ?? 0 };
  }

  const metadataName = `${authFirstName?.trim() || ""} ${authLastName?.trim() || ""}`.trim();
  const greetingName =
    `${profile?.first_name?.trim() || ""} ${profile?.last_name?.trim() || ""}`.trim() ||
    metadataName ||
    profile?.email?.split("@")[0] ||
    "there";

  return (
    <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Hello, {greetingName}.
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {role === "hr_manager" || role === "admin"
              ? "Manage your team, jobs, and payroll"
              : "Find your next opportunity"}
          </p>
        </div>

        {(role === "hr_manager" || role === "admin") && <HRDashboard stats={stats} />}
        {role === "candidate" && (
          <CandidateDashboard
            stats={stats}
            upcomingInterview={upcomingInterview}
          />
        )}
      </div>
    </PageContainer>
  );
}

// ── HR Dashboard ─────────────────────────────────────────────

function HRDashboard({ stats }: { stats: Record<string, number> }) {
  const employeeCount = stats.employees ?? 0;
  const activeJobCount = stats.jobs ?? 0;
  const pendingLeaveCount = stats.pendingLeaves ?? 0;
  const interviewCount = stats.interviews ?? 0;
  const applicantCount = stats.applicants ?? 0;

  const workforceSeries = [
    Math.max(employeeCount, 1),
    Math.max(activeJobCount * 12, 1),
    Math.max(pendingLeaveCount * 8, 1),
    Math.max(interviewCount * 10, 1),
    Math.max(applicantCount * 2, 1),
    Math.max(employeeCount + activeJobCount + interviewCount - pendingLeaveCount, 1),
  ];

  const chartMax = Math.max(...workforceSeries, 1);

  return (
    <div className="space-y-6">
      <div className="flex h-[64px] items-center justify-between gap-4">
        <div>
          <h1 className="font-(family-name:--font-heading) text-[28px] font-bold leading-tight text-text-primary">
            HR Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Overview of workforce metrics and hiring pipelines
          </p>
        </div>
        <Link
          href="/jobs/manage/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-white transition-all hover:bg-[#4A4880]"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Post New Job
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Employees"
          value={employeeCount}
          icon="group"
          tone="primary"
          badge="2.4%"
          badgeClass="text-success"
        />
        <SummaryCard
          label="Active Jobs"
          value={activeJobCount}
          icon="work"
          tone="secondary"
        />
        <SummaryCard
          label="Pending Leaves"
          value={pendingLeaveCount}
          icon="event_busy"
          tone="tertiary"
          badge={pendingLeaveCount > 0 ? "Action Needed" : undefined}
          badgeClass="bg-error/15 text-error"
        />
        <SummaryCard
          label="Interviews Today"
          value={interviewCount}
          icon="calendar_today"
          tone="primary-soft"
        />
      </div>

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
        <div className="rounded-xl border border-card-border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-(family-name:--font-heading) text-[22px] font-bold text-text-primary">
                Workforce Health Index
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Aggregated sentiment and engagement data
              </p>
            </div>
            <select className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary outline-none">
              <option>Last 6 Months</option>
              <option>Year to Date</option>
            </select>
          </div>

          <div className="flex h-[280px] items-end justify-between gap-3 px-1 sm:gap-md sm:px-4">
            {[
              { label: "JAN", values: workforceSeries },
              { label: "FEB", values: workforceSeries.slice(1).concat(workforceSeries[0]) },
              { label: "MAR", values: workforceSeries.slice(2).concat(workforceSeries.slice(0, 2)) },
              { label: "APR", values: workforceSeries.slice(3).concat(workforceSeries.slice(0, 3)) },
              { label: "MAY", values: workforceSeries.slice(4).concat(workforceSeries.slice(0, 4)) },
              { label: "JUN", values: workforceSeries.slice(5).concat(workforceSeries.slice(0, 5)) },
            ].map((month) => {
              const normalized = month.values.map((value) => Math.max(24, Math.round((value / chartMax) * 92)));

              return (
                <div key={month.label} className="group flex flex-1 flex-col items-center gap-2 sm:gap-sm">
                  <div className="flex w-full flex-col items-center gap-1">
                    <div className="h-[6px] w-full rounded-t-sm bg-primary/90" style={{ height: `${normalized[0]}px` }} />
                    <div className="h-[6px] w-full bg-primary/75" style={{ height: `${normalized[1]}px` }} />
                    <div className="h-[6px] w-full bg-primary/60" style={{ height: `${normalized[2]}px` }} />
                    <div className="h-[6px] w-full rounded-b-sm bg-primary/45" style={{ height: `${normalized[3]}px` }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-secondary">
                    {month.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-card-border pt-5">
            <LegendSwatch label="Retention" className="bg-primary" />
            <LegendSwatch label="Morale" className="bg-primary/80" />
            <LegendSwatch label="Feedback Rate" className="bg-primary/65" />
            <LegendSwatch label="Absence Rate" className="bg-primary/45" />
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="font-(family-name:--font-heading) text-[22px] font-bold text-text-primary">
              Quick Actions
            </h2>
            <Link href="/dashboard" className="text-xs font-bold text-primary hover:underline">
              View Hub
            </Link>
          </div>

          <div className="space-y-3">
            <QuickActionRow
              title="Review applicants"
              subtitle={`${applicantCount} total candidates in pipeline`}
              href="/applications"
              icon="layers"
              tone="primary"
            />
            <QuickActionRow
              title="Schedule an interview"
              subtitle={`${interviewCount} interviews scheduled today`}
              href="/interviews/schedule"
              icon="event"
              tone="secondary"
            />
            <QuickActionRow
              title="Pending leave requests"
              subtitle={pendingLeaveCount > 0 ? `${pendingLeaveCount} items need review` : "No leave requests waiting"}
              href="/leaves"
              icon="event_busy"
              tone={pendingLeaveCount > 0 ? "warning" : "neutral"}
              actionLabel={pendingLeaveCount > 0 ? "Review" : undefined}
            />
            <QuickActionRow
              title="Post a new job"
              subtitle="Open a new requisition for hiring"
              href="/jobs/manage/new"
              icon="work"
              tone="neutral"
            />
          </div>

          <div className="mt-6 border-t border-card-border pt-5">
            <div className="rounded-xl bg-surface px-4 py-4">
              <p className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
                Onboarding Pipeline
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {employeeCount} active employees · {activeJobCount} open jobs
              </p>
              <div className="mt-3 flex -space-x-2">
                <PipelineAvatar label={`${String(employeeCount).slice(0, 2) || "0"}`} tone="primary" />
                <PipelineAvatar label={`${String(activeJobCount).slice(0, 2) || "0"}`} tone="secondary" />
                <PipelineAvatar label={`${String(pendingLeaveCount).slice(0, 2) || "0"}`} tone="tertiary" />
                <PipelineAvatar label={`+${Math.max(interviewCount - 1, 0)}`} tone="neutral" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Candidate Dashboard ───────────────────────────────────────

function CandidateDashboard({
  stats,
  upcomingInterview,
}: {
  stats: Record<string, number>;
  upcomingInterview: CandidateUpcomingInterview | null;
}) {
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryCard label="Applications" value={stats.applications ?? 0} icon="folder_open" tone="primary" />
        <SummaryCard label="Interviews" value={stats.interviews ?? 0} icon="event" tone="secondary" />
      </div>

      {upcomingInterview && (
        <Link
          href="/interviews"
          className="block rounded-xl border border-card-border bg-white p-4 shadow-sm transition-colors hover:bg-surface"
        >
          <p className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
            Upcoming Interview
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {upcomingInterview.job_title} ·{" "}
            {new Date(upcomingInterview.scheduled_at).toLocaleString("en-PH", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            })}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {upcomingInterview.interview_type === "online" ? "Online" : "In-Person"} interview
          </p>
          {upcomingInterview.interview_type === "in_person" && upcomingInterview.location_address && (
            <p className="mt-1 text-xs text-text-secondary">
              {upcomingInterview.location_address}
              {upcomingInterview.location_notes && ` — ${upcomingInterview.location_notes}`}
            </p>
          )}
        </Link>
      )}

      <div className="rounded-xl border border-card-border bg-white p-4 shadow-sm space-y-2">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Quick actions</h2>
        <QuickLink href="/jobs"         label="Browse jobs" />
        <QuickLink href="/resume"       label="Manage my resume" />
        <QuickLink href="/applications" label="Track my applications" />
        <QuickLink href="/interviews"   label="My interviews" />
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  tone = "primary",
  badge,
  badgeClass,
}: {
  label: string;
  value: number;
  icon: string;
  tone?: "primary" | "secondary" | "tertiary" | "primary-soft";
  badge?: string;
  badgeClass?: string;
}) {
  const tones = {
    primary: "bg-primary/15 text-primary",
    secondary: "bg-secondary/25 text-[#5E4CA7]",
    tertiary: "bg-[#F2E9D7] text-[#93522E]",
    "primary-soft": "bg-primary/10 text-primary",
  };

  return (
    <div className="rounded-xl border border-card-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        {badge ? (
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${badgeClass ?? "bg-primary/10 text-primary"}`}>
            {tone === "primary" && <span className="material-symbols-outlined text-[14px]">trending_up</span>}
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-secondary">
        {label}
      </h3>
      <p className="font-(family-name:--font-heading) text-[28px] font-bold leading-none text-text-primary">
        {new Intl.NumberFormat("en-US").format(value)}
      </p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-card-border bg-white p-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
      </svg>
    </Link>
  );
}

function LegendSwatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-sm ${className}`} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-primary">
        {label}
      </span>
    </div>
  );
}

function QuickActionRow({
  title,
  subtitle,
  href,
  icon,
  tone,
  actionLabel,
}: {
  title: string;
  subtitle: string;
  href: string;
  icon: string;
  tone: "primary" | "secondary" | "warning" | "neutral";
  actionLabel?: string;
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-[#5E4CA7]",
    warning: "bg-[#FDF2E9] text-[#93522E]",
    neutral: "bg-surface text-text-primary",
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-card-border p-3 transition-colors hover:bg-surface"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClasses[tone]}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
          {subtitle}
        </p>
      </div>
      {actionLabel ? (
        <span className="rounded-full bg-error/15 px-2.5 py-1 text-[10px] font-bold text-error">
          {actionLabel}
        </span>
      ) : null}
    </Link>
  );
}

function PipelineAvatar({ label, tone }: { label: string; tone: "primary" | "secondary" | "tertiary" | "neutral" }) {
  const tones = {
    primary: "bg-primary text-white",
    secondary: "bg-secondary text-navbar",
    tertiary: "bg-[#F2E9D7] text-[#93522E]",
    neutral: "bg-surface text-text-secondary",
  };

  return (
    <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${tones[tone]}`}>
      {label}
    </div>
  );
}
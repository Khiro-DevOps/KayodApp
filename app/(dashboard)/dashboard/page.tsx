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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Active Jobs"           value={String(stats.jobs ?? 0)}       color="blue"   />
        <SummaryCard label="Total Applicants"      value={String(stats.applicants ?? 0)}  color="purple" />
        <SummaryCard label="Interviews Scheduled"  value={String(stats.interviews ?? 0)}  color="amber"  />
        <SummaryCard label="Active Employees"      value={String(stats.employees ?? 0)}   color="green"  />
      </div>
      {(stats.pendingLeaves ?? 0) > 0 && (
        <Link
          href="/leaves"
          className="flex items-center justify-between rounded-2xl bg-yellow-50 border border-yellow-200 p-4"
        >
          <div>
            <p className="text-sm font-medium text-yellow-800">Pending leave requests</p>
            <p className="text-xs text-yellow-600 mt-0.5">Tap to review and approve</p>
          </div>
          <span className="rounded-full bg-yellow-200 px-3 py-1 text-sm font-bold text-yellow-800">
            {stats.pendingLeaves}
          </span>
        </Link>
      )}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Quick actions</h2>
        <QuickLink href="/applications"        label="Review applicants" />
        <QuickLink href="/interviews/schedule" label="Schedule an interview" />
        <QuickLink href="/interviews"          label="View all interviews" />
        <QuickLink href="/jobs/manage/new"     label="Post a new job" />
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Applications" value={String(stats.applications ?? 0)} color="blue"   />
        <SummaryCard label="Interviews"   value={String(stats.interviews ?? 0)}   color="purple" />
      </div>

      {upcomingInterview && (
        <Link
          href="/interviews"
          className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 transition-colors"
        >
          <p className="text-sm font-semibold text-blue-800">Upcoming Interview</p>
          <p className="mt-1 text-sm text-blue-700">
            {upcomingInterview.job_title} ·{" "}
            {new Date(upcomingInterview.scheduled_at).toLocaleString("en-PH", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            })}
          </p>
          <p className="mt-1 text-xs text-blue-700">
            {upcomingInterview.interview_type === "online" ? "🎥 Online" : "🏢 In-Person"} interview
          </p>
          {upcomingInterview.interview_type === "in_person" && upcomingInterview.location_address && (
            <p className="mt-1 text-xs text-blue-700">
              📍 {upcomingInterview.location_address}
              {upcomingInterview.location_notes && ` — ${upcomingInterview.location_notes}`}
            </p>
          )}
        </Link>
      )}

      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Quick actions</h2>
        <QuickLink href="/jobs"         label="Browse jobs" />
        <QuickLink href="/resume"       label="Manage my resume" />
        <QuickLink href="/applications" label="Track my applications" />
        <QuickLink href="/interviews"   label="My interviews" />
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────

function SummaryCard({ label, value, color = "blue" }: {
  label: string;
  value: string;
  color?: "blue" | "green" | "purple" | "amber" | "red";
}) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700",
    green:  "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    amber:  "bg-yellow-50 text-yellow-700",
    red:    "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-2xl border border-border p-4 text-center ${colors[color]}`}>
      <p className="font-(family-name:--font-heading) text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
      </svg>
    </Link>
  );
}
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { InterviewType, Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole } from "@/lib/roles";

interface CandidateUpcomingInterview {
  id: string;
  scheduled_at: string;
  interview_type: InterviewType;
  job_title: string;
}

interface CandidatePreferencePrompt {
  application_id: string;
  job_title: string;
  offered_modes: InterviewType[];
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  const authFirstName = (user.user_metadata?.first_name ?? rawMetadata.first_name) as string | undefined;
  const authLastName = (user.user_metadata?.last_name ?? rawMetadata.last_name) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const role = effectiveRole(profile?.role, authRole);
  let stats: Record<string, number> = {};
  let upcomingInterview: CandidateUpcomingInterview | null = null;
  let pendingPreference: CandidatePreferencePrompt | null = null;

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
      jobs: jobCount ?? 0,
      applicants: applicantCount ?? 0,
      interviews: interviewCount ?? 0,
      employees: employeeCount ?? 0,
      pendingLeaves: leaveCount ?? 0,
    };
  } else if (role === "employee") {
    const { data: employee } = await supabase
      .from("employees").select("id").eq("profile_id", user.id).single();
    if (employee) {
      const [{ count: leaveCount }, { count: payslipCount }] = await Promise.all([
        supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("employee_id", employee.id).eq("status", "pending"),
        supabase.from("payslips").select("*", { count: "exact", head: true }).eq("employee_id", employee.id).eq("status", "paid"),
      ]);
      stats = { pendingLeaves: leaveCount ?? 0, payslips: payslipCount ?? 0 };
    }
  } else {
    const [{ count: appCount }, { count: interviewCount }, { data: nextInterview }, { data: pendingPreferenceApps }] = await Promise.all([
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("candidate_id", user.id),
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("candidate_id", user.id).eq("status", "interview_scheduled"),
      supabase
        .from("interviews")
        .select(`
          id,
          scheduled_at,
          interview_type,
          applications!inner (
            candidate_id,
            job_postings ( title )
          )
        `)
        .eq("applications.candidate_id", user.id)
        .in("status", ["scheduled", "confirmed", "rescheduled"])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("applications")
        .select(`
          id,
          status,
          selected_mode,
          hr_offered_modes,
          job_postings ( title )
        `)
        .eq("candidate_id", user.id)
        .in("status", ["shortlisted", "under_review", "interview_scheduled"])
        .is("selected_mode", null)
        .order("updated_at", { ascending: false }),
    ]);

    if (nextInterview) {
      const nextInterviewApp = nextInterview.applications as unknown as {
        job_postings?: { title?: string }[];
      };
      upcomingInterview = {
        id: nextInterview.id,
        scheduled_at: nextInterview.scheduled_at,
        interview_type: nextInterview.interview_type,
        job_title: nextInterviewApp?.job_postings?.[0]?.title ?? "Interview",
      };
    }

    const firstPendingPreference = (pendingPreferenceApps ?? []).find((app) => {
      const modes = (app.hr_offered_modes as InterviewType[] | null) ?? [];
      return modes.length > 0;
    });

    if (firstPendingPreference) {
      const pendingAppJob = firstPendingPreference.job_postings as unknown as { title?: string }[];
      pendingPreference = {
        application_id: firstPendingPreference.id,
        job_title: pendingAppJob?.[0]?.title ?? "this role",
        offered_modes: ((firstPendingPreference.hr_offered_modes as InterviewType[] | null) ?? []).filter(
          (mode): mode is InterviewType => mode === "online" || mode === "in_person"
        ),
      };
    }

    stats = { applications: appCount ?? 0, interviews: interviewCount ?? 0 };
  }

  const metadataName = `${authFirstName?.trim() || ""} ${authLastName?.trim() || ""}`.trim();
  const greetingName = `${profile?.first_name?.trim() || ''} ${profile?.last_name?.trim() || ''}`.trim()
    || metadataName
    || profile?.email?.split("@")[0]
    || "there";

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
              : role === "employee"
              ? "View your schedule, leaves, and payslips"
              : "Find your next opportunity"}
          </p>
        </div>

        {(role === "hr_manager" || role === "admin") && <HRDashboard stats={stats} />}
        {role === "employee" && <EmployeeDashboard stats={stats} />}
        {role === "candidate" && (
          <CandidateDashboard
            stats={stats}
            upcomingInterview={upcomingInterview}
            pendingPreference={pendingPreference}
          />
        )}
      </div>
    </PageContainer>
  );
}

function HRDashboard({ stats }: { stats: Record<string, number> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Active Jobs" value={String(stats.jobs ?? 0)} color="blue" />
        <SummaryCard label="Total Applicants" value={String(stats.applicants ?? 0)} color="purple" />
        <SummaryCard label="Interviews Scheduled" value={String(stats.interviews ?? 0)} color="amber" />
        <SummaryCard label="Active Employees" value={String(stats.employees ?? 0)} color="green" />
      </div>

      {(stats.pendingLeaves ?? 0) > 0 && (
        <Link href="/leaves" className="flex items-center justify-between rounded-2xl bg-yellow-50 border border-yellow-200 p-4">
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
        <QuickLink href="/applications" label="Review applicants" />
        <QuickLink href="/interviews/schedule" label="Schedule an interview" />
        <QuickLink href="/interviews" label="View all interviews" />
        <QuickLink href="/jobs/manage/new" label="Post a new job" />
      </div>
    </div>
  );
}

function EmployeeDashboard({ stats }: { stats: Record<string, number> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Pending Leaves" value={String(stats.pendingLeaves ?? 0)} color="amber" />
        <SummaryCard label="Payslips" value={String(stats.payslips ?? 0)} color="green" />
      </div>
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Quick actions</h2>
        <QuickLink href="/schedules" label="View my schedule" />
        <QuickLink href="/leaves" label="File a leave request" />
        <QuickLink href="/payroll" label="View my payslips" />
      </div>
    </div>
  );
}

function CandidateDashboard({
  stats,
  upcomingInterview,
  pendingPreference,
}: {
  stats: Record<string, number>;
  upcomingInterview: CandidateUpcomingInterview | null;
  pendingPreference: CandidatePreferencePrompt | null;
}) {
  const offeredModeLabels = (pendingPreference?.offered_modes ?? []).map((mode) =>
    mode === "online" ? "Online" : "In-Person"
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Applications" value={String(stats.applications ?? 0)} color="blue" />
        <SummaryCard label="Interviews" value={String(stats.interviews ?? 0)} color="purple" />
      </div>

      {upcomingInterview && (
        <Link
          href="/interviews"
          className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 transition-colors"
        >
          <p className="text-sm font-semibold text-blue-800">Upcoming Interview</p>
          <p className="mt-1 text-sm text-blue-700">
            {upcomingInterview.job_title} · {new Date(upcomingInterview.scheduled_at).toLocaleString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <p className="mt-1 text-xs text-blue-700">
            {upcomingInterview.interview_type === "online" ? "Online" : "In-Person"} interview
          </p>
        </Link>
      )}

      {pendingPreference && (
        <Link
          href={`/interviews/respond/${pendingPreference.application_id}`}
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors"
        >
          <p className="text-sm font-semibold text-amber-800">Choose Your Preferred Interview Setting</p>
          <p className="mt-1 text-sm text-amber-700">{pendingPreference.job_title}</p>
          <p className="mt-1 text-xs text-amber-700">
            Available: {offeredModeLabels.join(" / ") || "Online"}
          </p>
        </Link>
      )}

      <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Quick actions</h2>
        <QuickLink href="/jobs" label="Browse jobs" />
        <QuickLink href="/resume" label="Manage my resume" />
        <QuickLink href="/applications" label="Track my applications" />
        <QuickLink href="/interviews" label="My interviews" />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color = "blue" }: {
  label: string; value: string;
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
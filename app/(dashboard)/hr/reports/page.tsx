import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role as string | undefined) ?? undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "tenant_id">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/hr");

  const currentCompanyId = profile?.tenant_id?.trim();
  if (!currentCompanyId) redirect("/hr");
  const currentUserId = user.id;

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", currentCompanyId)
    .maybeSingle<{ name?: string | null }>();

  const companyName = company?.name?.trim() || "Your Company";

  // --- Aggregate stats ---

  // Total jobs
  const { count: totalJobs } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .eq("created_by", currentUserId);

  // Active jobs
  const { count: activeJobs } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .eq("created_by", currentUserId)
    .eq("is_published", true);

  // Total applicants
  const { count: totalApplicants } = await supabase
    .from("applications")
    .select("*, job_postings!inner(created_by)", { count: "exact", head: true })
    .eq("job_postings.created_by", currentUserId);

  // Applications by status
  const statusCounts: Record<string, number> = {
    submitted: 0,
    shortlisted: 0,
    interview_scheduled: 0,
    hired: 0,
  };

  for (const status of Object.keys(statusCounts)) {
    const { count } = await supabase
      .from("applications")
      .select("*, job_postings!inner(created_by)", { count: "exact", head: true })
      .eq("job_postings.created_by", currentUserId)
      .eq("status", status);
    statusCounts[status] = count || 0;
  }

  // Total employees (active)
  const { count: activeEmployees } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("profiles.tenant_id", currentCompanyId)
    .eq("employment_status", "active");

  // Average match score
  const { data: matchData } = await supabase
    .from("applications")
    .select("match_score, job_postings!inner(created_by)")
    .eq("job_postings.created_by", currentUserId)
    .not("match_score", "is", null);

  const scores = (matchData || [])
    .map((d) => d.match_score as number)
    .filter((s) => s !== null);
  const avgMatchScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  // Hire rate
  const hireRate =
    (totalApplicants || 0) > 0
      ? Math.round(((statusCounts.hired || 0) / (totalApplicants || 1)) * 100)
      : 0;

  // --- Per-job breakdown ---
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, is_published")
    .eq("created_by", currentUserId)
    .order("created_at", { ascending: false });

  type JobStat = {
    id: string;
    title: string;
    status: string;
    applicants: number;
    hired: number;
  };

  const jobStats: JobStat[] = [];
  for (const job of jobs || []) {
    const { count: appCount } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_posting_id", job.id);

    const { count: hiredCount } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_posting_id", job.id)
      .eq("status", "hired");

    jobStats.push({
      id: job.id,
      title: job.title,
      status: job.is_published ? "Published" : "Draft",
      applicants: appCount || 0,
      hired: hiredCount || 0,
    });
  }

  const funnelSteps = [
    { label: "Submitted", count: statusCounts.submitted, color: "bg-info" },
    { label: "Shortlisted", count: statusCounts.shortlisted, color: "bg-warning" },
    { label: "Interview", count: statusCounts.interview_scheduled, color: "bg-purple-500" },
    { label: "Hired", count: statusCounts.hired, color: "bg-success" },
  ];

  const maxFunnel = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/hr"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              Analytics
            </h1>
            <p className="text-xs text-text-secondary">{companyName}</p>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Jobs" value={totalJobs || 0} sub={`${activeJobs || 0} active`} />
          <StatCard label="Total Applicants" value={totalApplicants || 0} />
          <StatCard label="Total Hires" value={statusCounts.hired} />
          <StatCard label="Active Employees" value={activeEmployees || 0} />
          <StatCard
            label="Hire Rate"
            value={`${hireRate}%`}
            accent={hireRate >= 20 ? "text-success" : undefined}
          />
          <StatCard
            label="Avg Match Score"
            value={avgMatchScore !== null ? `${avgMatchScore}%` : "—"}
            accent={
              avgMatchScore !== null
                ? avgMatchScore >= 70
                  ? "text-success"
                  : avgMatchScore >= 40
                    ? "text-warning"
                    : undefined
                : undefined
            }
          />
        </div>

        {/* Application Funnel */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <h2 className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
            Application Funnel
          </h2>
          <div className="space-y-2.5">
            {funnelSteps.map((step) => (
              <div key={step.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{step.label}</span>
                  <span className="font-medium text-text-primary">{step.count}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${step.color} transition-all`}
                    style={{
                      width: `${Math.max((step.count / maxFunnel) * 100, step.count > 0 ? 4 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Applicants Per Job */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <h2 className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
            Applicants Per Job
          </h2>

          {jobStats.length === 0 ? (
            <p className="text-xs text-text-secondary">No jobs posted yet</p>
          ) : (
            <div className="space-y-2">
              {jobStats.map((job) => (
                <Link
                  key={job.id}
                  href={`/hr/applicants?jobId=${job.id}`}
                  className="flex items-center justify-between rounded-xl bg-background p-3 hover:bg-primary/5 transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {job.title}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {job.status === "active" ? "Active" : "Closed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <p className="text-sm font-bold text-text-primary">
                        {job.applicants}
                      </p>
                      <p className="text-[10px] text-text-secondary">applicants</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-success">
                        {job.hired}
                      </p>
                      <p className="text-[10px] text-text-secondary">hired</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 text-center">
      <p
        className={`font-(family-name:--font-heading) text-2xl font-bold ${
          accent || "text-text-primary"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
      {sub && <p className="text-[10px] text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

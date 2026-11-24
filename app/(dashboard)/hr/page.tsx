import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import PageContainer from "@/components/ui/page-container";
import { HR_ROLE_LABELS } from "@/lib/rbac/permissions";
import { requireHrPermission } from "@/lib/rbac/server";
import HRDashboardView, { type TopCandidateMatch } from "./hr-dashboard-view";

export default async function HRDashboardPage() {
  const ctx = await requireHrPermission("settings:manage_roles");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      *,
      tenants (
        name
      )
    `)
    .eq("id", ctx.id)
    .single();

  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "HR Manager"
    : "HR Manager";

  const admin = getAdminClient();

  // 1. Count Total Employees
  const { count: totalEmployees } = await admin
    .from("employees")
    .select("*", { count: "exact", head: true });

  // 2. Count Active Jobs
  const { count: activeJobs } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true);

  // 3. Count Pending Leaves
  const { count: pendingLeaves } = await admin
    .from("leave_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // 4. Count Interviews Scheduled for Today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { count: interviewsToday } = await supabase
    .from("interviews")
    .select("*", { count: "exact", head: true })
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString());

  // 5. Query Real Top Applicants for Quick Actions
  const { data: topApps } = await supabase
    .from("applications")
    .select(`
      id,
      match_score,
      submitted_at,
      profiles ( first_name, last_name, avatar_url, email ),
      job_postings ( title )
    `)
    .order("match_score", { ascending: false, nullsFirst: false })
    .limit(3);

  const topCandidates: TopCandidateMatch[] = (topApps ?? []).map((app: any) => {
    const firstName = app.profiles?.first_name ?? "";
    const lastName = app.profiles?.last_name ?? "";
    const name = `${firstName} ${lastName}`.trim() || app.profiles?.email?.split("@")[0] || "Applicant";
    const jobTitle = app.job_postings?.title ?? "Job Applicant";
    const matchScore = app.match_score !== null ? Math.round(Number(app.match_score)) : null;

    return {
      id: app.id,
      name,
      jobTitle,
      avatarUrl: app.profiles?.avatar_url ?? null,
      matchScore,
    };
  });

  return (
    <PageContainer>
      <HRDashboardView
        fullName={fullName}
        roleLabelText={HR_ROLE_LABELS[ctx.hr_role]}
        totalEmployees={totalEmployees ?? 0}
        activeJobs={activeJobs ?? 0}
        pendingLeaves={pendingLeaves ?? 0}
        interviewsToday={interviewsToday ?? 0}
        topCandidates={topCandidates}
      />
    </PageContainer>
  );
}

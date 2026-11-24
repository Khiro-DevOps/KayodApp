import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireHrPermission } from "@/lib/rbac/server";
import { getHrJobScope, getTenantTeamNamesMap, resolveOwnerName } from "@/lib/hr-job-scope";
import { HRInterviewClientView } from "./_components/HRInterviewClientView";

type Candidate = { first_name?: string | null; last_name?: string | null; email?: string | null; avatar_url?: string | null };
type ScheduleRecord = {
  id: string;
  application_id: string;
  applicant_id: string | null;
  interviewer_id: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  room_name: string | null;
  meeting_link: string | null;
  meeting_type: "online" | "in_person" | "hybrid";
  office_branch_id: string | null;
  office_branch: { name: string; address: string | null } | null;
  interview_notes: string | null;
  scorecard: Record<string, unknown> | null;
  direct_applicant?: Candidate | null;
  application: {
    applicant_id: string;
    match_score: number | null;
    technical_alignment: number | null;
    role_fit: number | null;
    resume: { id?: string; title?: string | null; pdf_url: string | null } | null;
    job: { id?: string; title: string | null; work_setup: string | null; tenant_id?: string | null; created_by?: string | null } | null;
    applicant: Candidate | null;
  } | null;
  interviewer: { first_name?: string | null; last_name?: string | null } | null;
};
type ApplicationRecord = {
  id: string;
  job: { title: string | null; tenant_id?: string | null; created_by?: string | null } | null;
  applicant: Candidate | null;
};
type InterviewerRecord = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; tenant_id?: string | null };

export default async function HRInterviewsPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialScope: "mine" | "all" =
    resolvedParams?.scope === "all" ? "all" : "mine";

  const ctx = await requireHrPermission("interviews:conduct");
  const supabase = await createClient();
  const user = { id: ctx.id };

  const admin = getAdminClient();
  const jobScope = await getHrJobScope(admin, user.id);
  const teamNamesMap = await getTenantTeamNamesMap(supabase, jobScope.tenantId);

  const [{ data: schedulesData }, { data: applicationsData }, { data: interviewersData }] = await Promise.all([
    admin
      .from("interview_schedules")
      .select(`
        id, application_id, interviewer_id, applicant_id, scheduled_at, duration_minutes,
        status, room_name, meeting_link, video_provider, interview_notes, scorecard, meeting_type, office_branch_id,
        office_branch:office_branches ( name, address ),
        direct_applicant:profiles!interview_schedules_applicant_id_fkey ( first_name, last_name, email, avatar_url ),
        application:job_applications!interview_schedules_application_id_fkey (
          id, applicant_id, match_score, technical_alignment, role_fit,
          resume:resumes!job_applications_resume_id_fkey ( id, title, pdf_url ),
          job:job_postings!job_applications_job_id_fkey ( id, title, work_setup, tenant_id, created_by ),
          applicant:profiles!job_applications_applicant_id_fkey ( first_name, last_name, email, avatar_url )
        ),
        interviewer:profiles!interview_schedules_interviewer_id_fkey ( first_name, last_name )
      `)
      .order("scheduled_at", { ascending: true, nullsFirst: false }),
    admin
      .from("job_applications")
      .select("id, job:job_postings!job_applications_job_id_fkey ( title, tenant_id, created_by ), applicant:profiles!job_applications_applicant_id_fkey ( first_name, last_name, email )")
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id, first_name, last_name, email, role, tenant_id")
      .in("role", ["hr", "hr_manager", "admin", "interviewer"]),
  ]);

  const tenantFilteredSchedules = (schedulesData as ScheduleRecord[] | null || []).filter((item) => {
    if (!jobScope.tenantId) return true;
    const jobTenantId = item.application?.job?.tenant_id;
    return !jobTenantId || jobTenantId === jobScope.tenantId;
  });

  const schedules = tenantFilteredSchedules.map((item) => {
    const application = item.application;
    const candidate = application?.applicant ?? item.direct_applicant;
    const candidateName = candidate
      ? `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email || "Applicant"
      : "Applicant";
    const interviewer = item.interviewer;

    return {
      id: item.id,
      application_id: item.application_id,
      applicant_id: item.applicant_id,
      interviewer_id: item.interviewer_id,
      scheduled_at: item.scheduled_at,
      duration_minutes: item.duration_minutes || 45,
      status: item.status,
      room_name: item.room_name,
      meeting_link: item.meeting_link,
      meeting_type: item.meeting_type ?? "online",
      office_branch_id: item.office_branch_id,
      branchName: item.office_branch?.name ?? null,
      branchAddress: item.office_branch?.address ?? null,
      interview_notes: item.interview_notes || "",
      scorecard: item.scorecard || {},
      candidateName,
      candidateEmail: candidate?.email || null,
      candidateAvatarUrl: candidate?.avatar_url || null,
      candidateSlug: candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || item.application_id,
      jobTitle: application?.job?.title || "Job Position",
      interviewerName: interviewer ? `${interviewer.first_name || ""} ${interviewer.last_name || ""}`.trim() : null,
      matchScore: application?.match_score ?? null,
      technicalAlignment: application?.technical_alignment ?? null,
      roleFit: application?.role_fit ?? null,
      workSetup: application?.job?.work_setup ?? null,
      resumeTitle: application?.resume?.title ?? null,
      resumeUrl: application?.resume?.pdf_url ?? null,
      jobCreatedBy: application?.job?.created_by ?? null,
      ownerName: resolveOwnerName(teamNamesMap, application?.job?.created_by, "full"),
    };
  });

  const applications = (applicationsData as ApplicationRecord[] | null || [])
    .filter((app) => !jobScope.tenantId || !app.job?.tenant_id || app.job.tenant_id === jobScope.tenantId)
    .map((app) => {
      const candidate = app.applicant;
      return {
        id: app.id,
        candidateName: candidate ? `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email || "Applicant" : "Applicant",
        jobTitle: app.job?.title || "Job Position",
      };
    });

  const interviewers = (interviewersData as InterviewerRecord[] | null || [])
    .filter((item) => !jobScope.tenantId || !item.tenant_id || item.tenant_id === jobScope.tenantId)
    .map((item) => ({
      id: item.id,
      name: `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email || "HR Member",
    }));

  return (
    <HRInterviewClientView
      schedules={schedules}
      applications={applications}
      interviewers={interviewers}
      currentUserId={user.id}
      initialScope={initialScope}
    />
  );
}

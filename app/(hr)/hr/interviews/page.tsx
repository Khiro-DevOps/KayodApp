import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HRInterviewClientView } from "./_components/HRInterviewClientView";

export default async function HRInterviewsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr", "hr_manager", "admin"].includes(String(profile.role))) redirect("/dashboard");

  const { data: schedulesData } = await supabase
    .from("interview_schedules")
    .select(`
      id, application_id, interviewer_id, applicant_id, scheduled_at, duration_minutes,
      status, room_name, meeting_link, video_provider, interview_notes, scorecard,
      application:job_applications!interview_schedules_application_id_fkey (
        id, applicant_id, match_score,
        resume:resumes!job_applications_resume_id_fkey ( pdf_url ),
        job:job_postings!job_applications_job_id_fkey ( id, title, work_setup ),
        applicant:profiles!job_applications_applicant_id_fkey ( first_name, last_name, email )
      ),
      interviewer:profiles!interview_schedules_interviewer_id_fkey ( first_name, last_name )
    `)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  const { data: applicationsData } = await supabase
    .from("job_applications")
    .select("id, job:job_postings!job_applications_job_id_fkey ( title ), applicant:profiles!job_applications_applicant_id_fkey ( first_name, last_name, email )")
    .order("created_at", { ascending: false });

  const { data: interviewersData } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role")
    .in("role", ["hr_manager", "admin", "interviewer"]);

  const schedules = (schedulesData || []).map((item: any) => {
    const application = item.application;
    const candidate = application?.applicant;
    const candidateName = candidate
      ? `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email
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
      interview_notes: item.interview_notes || "",
      scorecard: item.scorecard || {},
      candidateName,
      candidateEmail: candidate?.email || null,
      candidateSlug: candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || item.application_id,
      jobTitle: application?.job?.title || "Job Position",
      interviewerName: interviewer ? `${interviewer.first_name || ""} ${interviewer.last_name || ""}`.trim() : null,
      matchScore: application?.match_score ?? null,
      workSetup: application?.job?.work_setup ?? null,
      resumeUrl: application?.resume?.pdf_url ?? null,
    };
  });

  const applications = (applicationsData || []).map((app: any) => {
    const candidate = app.applicant;
    return {
      id: app.id,
      candidateName: candidate ? `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email : "Applicant",
      jobTitle: app.job?.title || "Job Position",
    };
  });

  const interviewers = (interviewersData || []).map((item: any) => ({
    id: item.id,
    name: `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email || "HR Member",
  }));

  return <HRInterviewClientView schedules={schedules} applications={applications} interviewers={interviewers} />;
}

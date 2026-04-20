import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile, Application } from "@/lib/types";
import ApplicationDetailView from "../application-detail-view";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // Fetch application with all related data
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      candidate_id,
      resume_id,
      status,
      cover_letter,
      match_score,
      hr_notes,
      submitted_at,
      updated_at,
      profiles ( id, first_name, last_name, email, phone, avatar_url, city, country ),
      resumes ( id, title, pdf_url, content_text ),
      job_postings ( id, title, location, description, salary_min, salary_max, currency, employment_type )
    `)
    .eq("id", id)
    .single<Application>();

  if (!application) {
    redirect("/applications");
  }

  // Access control: HR can view any application, candidates can only view their own
  if (!isHR && application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // Fetch interviews for this application
  const { data: interviews } = await supabase
    .from("interviews")
    .select(`
      id,
      status,
      interview_type,
      scheduled_at,
      duration_minutes,
      timezone,
      location_address,
      location_notes,
      video_room_url,
      interviewer_notes,
      interview_score,
      profiles ( first_name, last_name, email )
    `)
    .eq("application_id", id)
    .order("scheduled_at", { ascending: false });

  return (
    <PageContainer>
      <ApplicationDetailView
        application={application}
        interviews={interviews ?? []}
        userRole={role}
        isCurrentUser={!isHR}
      />
    </PageContainer>
  );
}

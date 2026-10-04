"use server";

import { createClient } from "@/lib/supabase/server";

export interface InterviewRecord {
  id: string;
  application_id: string;
  job_id: string | null;
  applicant_id: string | null;
  interviewer_id: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  status: string;
  room_name: string | null;
  meeting_link: string | null;
  video_provider: string;
  interview_notes: string;
  scorecard: Record<string, unknown>;
  candidate: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  job: { id: string; title: string } | null;
  resume: { id: string; pdf_url: string | null } | null;
}

const interviewSelection = `
  id,
  application_id,
  job_id,
  applicant_id,
  interviewer_id,
  scheduled_at,
  duration_minutes,
  status,
  room_name,
  meeting_link,
  video_provider,
  interview_notes,
  scorecard,
  application:job_applications!interview_schedules_application_id_fkey (
    applicant:profiles!job_applications_applicant_id_fkey ( id, first_name, last_name, email ),
    job:job_postings!job_applications_job_id_fkey ( id, title ),
    resume:resumes!job_applications_resume_id_fkey ( id, pdf_url )
  )
`;

export async function getInterviewByApplicationId(
  applicationId: string
): Promise<InterviewRecord | null> {
  if (!applicationId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_schedules")
    .select(interviewSelection)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch interview: ${error.message}`);
  if (!data) return null;

  const application = data.application as {
    applicant?: InterviewRecord["candidate"];
    job?: InterviewRecord["job"];
    resume?: InterviewRecord["resume"];
  } | null;

  return {
    ...(data as unknown as Omit<InterviewRecord, "candidate" | "job" | "resume">),
    candidate: application?.applicant ?? null,
    job: application?.job ?? null,
    resume: application?.resume ?? null,
  };
}

export async function updateInterviewNotes(
  interviewId: string,
  notes: string
): Promise<{ success: true } | { success: false; error: string }> {
  if (!interviewId) return { success: false, error: "Interview ID is required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isHr = ["hr", "hr_manager", "admin"].includes(String(profile?.role));

  let query = supabase
    .from("interview_schedules")
    .update({ interview_notes: notes.trim(), updated_at: new Date().toISOString() })
    .eq("id", interviewId);
  if (!isHr) query = query.eq("interviewer_id", user.id);

  const { error } = await query;

  if (error) return { success: false, error: error.message };
  return { success: true };
}
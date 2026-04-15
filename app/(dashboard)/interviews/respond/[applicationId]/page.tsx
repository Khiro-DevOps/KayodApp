// app/(dashboard)/interviews/respond/[applicationId]/page.tsx
// Job seeker lands here after clicking the "You're qualified!" notification.
// Shows job info and lets them choose online or in-person interview.

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { RespondClient } from "./respond-client";

export default async function InterviewRespondPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch application with job details
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id,
      status,
      interview_preference,
      interview_preference_set_at,
      interview_qualified_at,
      candidate_id,
      job_postings (
        id,
        title,
        description,
        requirements,
        location,
        is_remote,
        employment_type,
        salary_min,
        salary_max,
        currency,
        required_skills,
        departments ( name )
      )
    `)
    .eq("id", applicationId)
    .single();

  if (!application) notFound();

  // Only the candidate who owns this application can access this page
  if (application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // If not yet qualified, redirect away
  const eligibleStatuses = ["shortlisted", "interview_scheduled", "under_review"];
  if (!eligibleStatuses.includes(application.status)) {
    redirect("/applications");
  }

  const job = application.job_postings as any;

  return (
    <PageContainer>
      <RespondClient
        applicationId={applicationId}
        job={job}
        existingPreference={application.interview_preference ?? null}
        preferenceSetAt={application.interview_preference_set_at ?? null}
      />
    </PageContainer>
  );
}
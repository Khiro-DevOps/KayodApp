// app/(dashboard)/interviews/respond/[applicationId]/page.tsx
// Job seeker lands here after clicking the "You're qualified!" notification.
// Shows job info and lets them choose online or in-person interview.

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { RespondClient } from "./respond-client";
import type { InterviewType } from "@/lib/types";

type RespondJob = {
  id: string;
  title: string;
  description: string;
  requirements?: string | null;
  location?: string | null;
  is_remote: boolean;
  employment_type: string;
  salary_min?: number | null;
  salary_max?: number | null;
  currency: string;
  required_skills?: string[] | null;
  departments?: { name: string }[] | null;
};

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
    .from("job_applications")
    .select(`
      id,
      status,
      applicant_id,
      job:job_postings!job_applications_job_id_fkey (
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
  if (application.applicant_id !== user.id) {
    redirect("/applications");
  }

  // If not yet qualified, redirect away
  const eligibleStatuses = ["applied", "screening", "interview"];
  if (!eligibleStatuses.includes(application.status)) {
    redirect("/applications");
  }

  const jobRelation = application.job as RespondJob | RespondJob[] | null;
  const job = Array.isArray(jobRelation) ? jobRelation[0] : jobRelation;
  if (!job) notFound();

  const offeredModes: InterviewType[] = ["online", "in_person"];

  return (
    <PageContainer>
      <RespondClient
        applicationId={applicationId}
        job={{ ...job, departments: job.departments?.[0] ?? null }}
        offeredModes={offeredModes}
        hrOfficeAddress={null}
        existingPreference={null}
        preferenceSetAt={null}
      />
    </PageContainer>
  );
}
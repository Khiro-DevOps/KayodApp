"use server";

import { notifyJobCreator } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  computeCanonicalJobMatch,
  computeAndStoreApplicationMatch,
  persistCanonicalMatchCache,
  type CanonicalJobInput,
  type CanonicalResumeInput,
} from "@/lib/match-scoring";

export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const jobId = formData.get("job_id") as string;
  const resumeId = formData.get("resume_id") as string;
  const coverLetter = formData.get("cover_letter") as string;

  if (!jobId || !resumeId) {
    return { success: false, error: "Missing required fields" };
  }

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, tenant_id, is_published, closes_at, created_by, title, description, requirements, required_skills, industry, job_category, work_setup, location, city_id, province_id, min_experience, employment_type")
    .eq("id", jobId)
    .single<CanonicalJobInput & { id: string; tenant_id: string | null; is_published: boolean; closes_at: string | null; created_by: string | null; title: string }>();

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.closes_at && new Date(job.closes_at) < new Date()) {
    return { success: false, error: "Job posting has closed" };
  }

  const { data: existingJA } = await supabase
    .from("job_applications")
    .select("id")
    .eq("applicant_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingJA) {
    return { success: false, error: "Already applied", alreadyApplied: true };
  }

  const [{ data: resume }, { data: candidateProfile }] = await Promise.all([
    supabase
      .from("resumes")
      .select("*")
      .eq("id", resumeId)
      .maybeSingle<CanonicalResumeInput>(),
    supabase
      .from("profiles")
      .select("work_setup, city_id, province_id, city")
      .eq("id", user.id)
      .maybeSingle<{
        work_setup?: string | null;
        city_id?: string | null;
        province_id?: string | null;
        city?: string | null;
      }>(),
  ]);

  const canonicalMatch = resume
    ? computeCanonicalJobMatch({
        resume,
        job,
        candidate: {
          city_id: candidateProfile?.city_id ?? null,
          province_id: candidateProfile?.province_id ?? null,
          preferred_work_setup: candidateProfile?.work_setup ?? null,
          location: candidateProfile?.city ?? null,
        },
      })
    : null;

  const now = new Date().toISOString();
  const { data: createdJA, error: jaError } = await supabase
    .from("job_applications")
    .insert({
      applicant_id: user.id,
      job_id: jobId,
      resume_id: resumeId,
      cover_letter: coverLetter || null,
      status: "applied",
      match_score: canonicalMatch?.score ?? null,
      created_at: now,
      status_updated_at: now,
    })
    .select("id")
    .single();

  if (jaError || !createdJA) {
    console.error("Job application submission error:", jaError);
    return { success: false, error: jaError?.message || "Failed to submit application" };
  }

  try {
    if (canonicalMatch) {
      await persistCanonicalMatchCache({
        applicantId: user.id,
        jobId,
        result: canonicalMatch,
      });
    }
    await computeAndStoreApplicationMatch(createdJA.id, true);
  } catch (recomputeError) {
    console.warn("Match score computation failed:", recomputeError);
  }

  // Notify the HR Manager
  if (job.created_by) {
    await notifyJobCreator({
      jobId: job.id,
      type: "application_submitted",
      title: "New Job Application 📄",
      body: `A new candidate has applied for ${job.title || "your job posting"}.`,
      link: "/hr/applicants",
      metadata: { applicationId: createdJA.id },
      senderId: user.id,
    });
  }

  revalidatePath("/applicant/applications");
  revalidatePath("/applicant/applications");
  revalidatePath("/hr/applicants");
  revalidatePath("/applicant/jobs");

  return { success: true };
}

export async function withdrawApplication(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  const { data: application } = await supabase
    .from("job_applications")
    .select("id, applicant_id, status")
    .eq("id", applicationId)
    .single();

  if (!application || application.applicant_id !== user.id) {
    redirect("/applications");
  }

  if (application.status !== "applied") {
    redirect("/applications");
  }

  await supabase
    .from("job_applications")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", applicationId);

  revalidatePath("/applications");
  redirect("/applications?success=Application+withdrawn+successfully");
}
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  computeCanonicalJobMatch,
  computeAndStoreApplicationMatch,
  persistCanonicalMatchCache,
  type CanonicalJobInput,
  type CanonicalResumeInput,
} from "@/lib/match-scoring";
import { notifyJobCreator } from "@/lib/notifications";
import { getHrJobScope } from "@/lib/hr-job-scope";

export async function recalculateMatchScores() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (!profile || !["hr", "hr_manager", "admin"].includes(String(profile.role))) return { success: false, error: "Forbidden" };

  const admin = getAdminClient();
  const jobScope = await getHrJobScope(admin, user.id);
  const { data: jobs } = await admin.from("job_postings").select("id").or(jobScope.filter);
  const tenantJobIds = (jobs ?? []).map((j) => j.id);

  if (tenantJobIds.length === 0) {
    return { success: true, scored: 0, skipped: 0, failed: 0 };
  }

  const { data: rows, error } = await admin
    .from("job_applications")
    .select("id")
    .in("job_id", tenantJobIds);

  if (error) return { success: false, error: error.message };
  const ids = (rows ?? []).map((row) => row.id);
  let scored = 0;
  let failed = 0;
  for (let index = 0; index < ids.length; index += 10) {
    const results = await Promise.all(
      ids.slice(index, index + 10).map((id) => computeAndStoreApplicationMatch(id, true))
    );
    scored += results.filter((result) => result.success).length;
    failed += results.filter((result) => !result.success).length;
  }
  revalidatePath("/hr/applicants");
  revalidatePath("/applicant/jobs");
  return { success: true, scored, skipped: 0, failed };
}

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

  const [{ data: applicantProfile }, { data: activeEmployee }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role?: string | null }>(),
    supabase
      .from("employees")
      .select("id")
      .eq("profile_id", user.id)
      .eq("employment_status", "active")
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);

  if (applicantProfile?.role === "employee" || Boolean(activeEmployee)) {
    return { success: false, error: "You are already onboarded as an active employee." };
  }

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, tenant_id, is_published, closes_at, title, description, requirements, required_skills, industry, job_category, work_setup, location, city_id, province_id, min_experience, employment_type")
    .eq("id", jobId)
    .single<CanonicalJobInput & { id: string; tenant_id: string | null; is_published: boolean; closes_at: string | null; title: string }>();

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
      await computeAndStoreApplicationMatch(createdJA.id, true);
    } else {
      await computeAndStoreApplicationMatch(createdJA.id, true);
    }
  } catch (recomputeError) {
    console.warn("Match score computation failed:", recomputeError);
  }

  await notifyJobCreator({
    jobId: job.id,
    type: "application_submitted",
    title: "New Job Application 📄",
    body: `A new candidate has applied for ${job.title || "your job posting"}.`,
    link: `/hr/applicants?job=${job.id}&scope=all`,
    metadata: { applicationId: createdJA.id },
    senderId: user.id,
  });

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
  if (!applicationId) redirect("/applicant/applications");

  // Verify ownership on the canonical table — applicant can only withdraw their own
  const { data: application } = await supabase
    .from("job_applications")
    .select("id, applicant_id, status")
    .eq("id", applicationId)
    .single();

  if (!application || application.applicant_id !== user.id) {
    redirect("/applicant/applications");
  }

  // Can only withdraw from active (non-closed) statuses
  const closedStatuses = ["hired", "hire_confirmed", "rejected", "withdrawn"];
  if (closedStatuses.includes(application.status)) {
    redirect("/applicant/applications");
  }

  await supabase
    .from("job_applications")
    .update({
      status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("applicant_id", user.id);

  revalidatePath("/hr/applicants");
  revalidatePath("/hr", "layout");
  revalidatePath("/applicant/applications");
  redirect("/applicant/applications?success=Application+withdrawn+successfully");
}

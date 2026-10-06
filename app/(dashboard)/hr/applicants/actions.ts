"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { computeAndStoreMatchScore } from "@/lib/compute-match-score";

export async function recalculateMatchScores() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (!profile || !["hr", "hr_manager", "admin"].includes(String(profile.role))) return { success: false, error: "Forbidden" };
  const { data: rows, error } = await supabase.from("job_applications").select("id, match_score, job:job_postings!job_applications_job_id_fkey ( tenant_id )").or("match_score.is.null,match_score.eq.0");
  if (error) return { success: false, error: error.message };
  const ids = (rows ?? []).filter((row) => (row.job as { tenant_id?: string } | null)?.tenant_id === profile.tenant_id).map((row) => row.id);
  let scored = 0; let failed = 0;
  for (let index = 0; index < ids.length; index += 10) {
    const results = await Promise.all(ids.slice(index, index + 10).map((id) => computeAndStoreMatchScore(id)));
    scored += results.filter((result) => result.success).length;
    failed += results.filter((result) => !result.success).length;
  }
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

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, tenant_id, is_published, closes_at")
    .eq("id", jobId)
    .single();

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

  const now = new Date().toISOString();
  const { data: createdJA, error: jaError } = await supabase
    .from("job_applications")
    .insert({
      applicant_id: user.id,
      job_id: jobId,
      resume_id: resumeId,
      cover_letter: coverLetter || null,
      status: "applied",
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
    void computeAndStoreMatchScore(createdJA.id).catch((error) => console.warn("Match score computation failed:", error));
  } catch (recomputeError) {
    console.warn("Match score computation failed:", recomputeError);
  }

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
  revalidatePath("/applicant/applications");
  redirect("/applicant/applications?success=Application+withdrawn+successfully");
}

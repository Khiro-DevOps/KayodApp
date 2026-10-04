"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { computeAndStoreMatchScore } from "@/lib/compute-match-score";

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

  // 1. Fetch the target job record first to obtain its tenant_id
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

  // Check if already applied
  const { data: existingJA } = await supabase
    .from("job_applications")
    .select("id")
    .eq("applicant_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingJA) {
    return { success: false, error: "Already applied", alreadyApplied: true };
  }

  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", jobId)
    .maybeSingle();

  if (existingApp) {
    return { success: false, error: "Already applied", alreadyApplied: true };
  }

  // Primary insertion into `job_applications`
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

  // Legacy table insertion for backward compatibility (applications uses job_posting_id)
  const { data: createdApplication, error: appError } = await supabase
    .from("applications")
    .insert({
      candidate_id: user.id,
      job_posting_id: jobId,
      resume_id: resumeId,
      cover_letter: coverLetter || null,
      status: "applied",
      submitted_at: now,
    })
    .select("id")
    .single();

  if (appError) {
    console.warn("Legacy applications table insert error (non-fatal):", appError.message);
  }

  const targetAppId = createdApplication?.id || createdJA.id;
  try {
    await computeAndStoreMatchScore(targetAppId);
  } catch (recomputeError) {
    console.warn("Match score computation failed:", recomputeError);
  }

  // 4. Revalidate paths immediately
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

  // Verify the application belongs to the user
  const { data: application } = await supabase
    .from("applications")
    .select("id, candidate_id, status")
    .eq("id", applicationId)
    .single();

  if (!application || application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // Can only withdraw if status is "applied"
  if (application.status !== "applied") {
    redirect("/applications");
  }

  // Update status to withdrawn
  await supabase
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId);

  revalidatePath("/applications");
  redirect("/applications?success=Application+withdrawn+successfully");
}

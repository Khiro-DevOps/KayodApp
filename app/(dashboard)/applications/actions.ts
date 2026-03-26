"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { computeMatchScore } from "@/lib/match-score";

export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobListingId = formData.get("job_listing_id") as string;
  const resumeId = formData.get("resume_id") as string | null;

  if (!jobListingId) {
    redirect("/jobs");
  }

  // Verify user is a job seeker
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "job_seeker") redirect("/dashboard");

  // Check if already applied
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("job_listing_id", jobListingId)
    .maybeSingle();

  if (existing) {
    redirect(`/jobs/${jobListingId}?error=${encodeURIComponent("You have already applied to this job.")}`);
  }

  // Compute match score if resume has extracted text
  let matchScore: number | null = null;

  if (resumeId) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("extracted_text")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .single();

    if (resume?.extracted_text) {
      const { data: job } = await supabase
        .from("job_listings")
        .select("title, description, requirements, skills")
        .eq("id", jobListingId)
        .single();

      if (job) {
        matchScore = computeMatchScore(resume.extracted_text, job);
      }
    }
  }

  // Submit application
  const { error } = await supabase.from("applications").insert({
    user_id: user.id,
    job_listing_id: jobListingId,
    resume_id: resumeId || null,
    match_score: matchScore,
    status: "applied",
  });

  if (error) {
    redirect(`/jobs/${jobListingId}/apply?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/jobs/${jobListingId}`);
  revalidatePath("/dashboard");
  redirect(`/applications?success=${encodeURIComponent("Application submitted successfully!")}`);
}

export async function withdrawApplication(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  // Only allow withdrawal of own applications in "applied" status
  const { data: application } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("user_id", user.id)
    .single();

  if (!application || application.status !== "applied") {
    redirect("/applications");
  }

  await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("user_id", user.id);

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  redirect("/applications");
}

export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const status = formData.get("status") as string;
  const jobId = formData.get("job_id") as string;

  if (!applicationId || !status) redirect("/jobs/manage");

  // Verify the employer owns the job
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const validStatuses = ["applied", "shortlisted", "interview", "hired"];
  if (!validStatuses.includes(status)) redirect("/jobs/manage");

  const { error } = await supabase
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) {
    redirect(`/jobs/manage/${jobId}/applicants?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/jobs/manage/${jobId}/applicants`);
  revalidatePath("/applications");
  redirect(`/jobs/manage/${jobId}/applicants`);
}

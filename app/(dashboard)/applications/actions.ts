"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = formData.get("job_id") as string;
  const resumeId = formData.get("resume_id") as string;
  const coverLetter = formData.get("cover_letter") as string;

  if (!jobId || !resumeId) {
    redirect(`/jobs/${jobId}/apply?error=Missing+required+fields`);
  }

  // Verify job exists and is published
  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("id", jobId)
    .eq("is_published", true)
    .single();

  if (!job) {
    redirect(`/jobs/${jobId}/apply?error=Job+not+found`);
  }

  // Check if already applied
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", jobId)
    .maybeSingle();

  if (existing) {
    redirect(`/jobs/${jobId}?already_applied=true`);
  }

  // Create application
  const { error } = await supabase
    .from("applications")
    .insert({
      candidate_id: user.id,
      job_posting_id: jobId,
      resume_id: resumeId,
      cover_letter: coverLetter || null,
      status: "submitted",
    });

  if (error) {
    console.error("Application submission error:", error);
    redirect(`/jobs/${jobId}/apply?error=Failed+to+submit+application`);
  }

  revalidatePath("/applications");
  redirect(`/jobs/${jobId}?applied=true`);
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

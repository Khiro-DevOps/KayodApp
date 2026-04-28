"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getObjectPathFromPublicUrl, getResumeBucketName } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function deleteResume(formData: FormData) {
  const supabase = await createClient();
  const admin = await getAdminClient();
  const resumeBucketName = getResumeBucketName();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resumeId = formData.get("resume_id") as string;
  if (!resumeId) redirect("/resume");

  const { data: resume } = await supabase
    .from("resumes")
    .select("pdf_url, candidate_id")
    .eq("id", resumeId)
    .eq("candidate_id", user.id)
    .single();

  if (!resume) redirect("/resume");

  // Check if resume has any active applications
  const { data: applications, error: appsCheckError } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("resume_id", resumeId);

  if (appsCheckError) {
    console.error("Failed to check applications:", appsCheckError);
    throw new Error(`Failed to verify applications: ${appsCheckError.message}`);
  }

  if (applications && applications.length > 0) {
    throw new Error(
      "Cannot delete this resume because it has active applications. Please withdraw from all applications first."
    );
  }

  // Safe to delete: no applications reference this resume
  // Delete resume versions (foreign key constraint)
  const { error: versionsError } = await admin
    .from("resume_versions")
    .delete()
    .eq("resume_id", resumeId);

  if (versionsError) {
    console.error("Failed to delete resume versions:", versionsError);
    throw new Error(`Failed to delete resume versions: ${versionsError.message}`);
  }

  // Delete PDF file from storage
  if (resume.pdf_url) {
    const objectPath = getObjectPathFromPublicUrl(resume.pdf_url, resumeBucketName);
    if (objectPath) {
      await supabase.storage.from(resumeBucketName).remove([objectPath]);
    }
  }

  // Delete resume record
  const { error: deleteError } = await admin
    .from("resumes")
    .delete()
    .eq("id", resumeId)
    .eq("candidate_id", user.id);

  if (deleteError) {
    console.error("Failed to delete resume:", deleteError);
    throw new Error(`Failed to delete resume: ${deleteError.message}`);
  }

  revalidatePath("/resume");
  revalidatePath("/jobs");
}
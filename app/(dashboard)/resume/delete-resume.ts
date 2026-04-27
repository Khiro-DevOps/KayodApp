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

  // Delete in order: applications → resume_versions → resume record → storage
  // Use admin client to bypass RLS policies
  
  // 1. Delete applications that reference this resume
  const { error: applicationsError } = await admin
    .from("applications")
    .delete()
    .eq("resume_id", resumeId);

  if (applicationsError) {
    console.error("Failed to delete applications:", applicationsError);
    throw new Error(`Failed to delete applications: ${applicationsError.message}`);
  }

  // 2. Delete resume versions (foreign key constraint)
  const { error: versionsError } = await admin
    .from("resume_versions")
    .delete()
    .eq("resume_id", resumeId);

  if (versionsError) {
    console.error("Failed to delete resume versions:", versionsError);
    throw new Error(`Failed to delete resume versions: ${versionsError.message}`);
  }

  // 3. Delete PDF file from storage
  if (resume.pdf_url) {
    const objectPath = getObjectPathFromPublicUrl(resume.pdf_url, resumeBucketName);
    if (objectPath) {
      await supabase.storage.from(resumeBucketName).remove([objectPath]);
    }
  }

  // 4. Delete resume record (using admin to bypass RLS)
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
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getObjectPathFromPublicUrl, getResumeBucketName } from "@/lib/supabase/storage";

export async function getResumeSignedUrl(
  resumeId: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = await createClient();
  const resumeBucketName = getResumeBucketName();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data: resume, error: fetchError } = await supabase
    .from("resumes")
    .select("id, candidate_id, title, pdf_url")
    .eq("id", resumeId)
    .eq("candidate_id", user.id)
    .maybeSingle();

  if (fetchError || !resume) {
    throw new Error(`Resume not found or access denied: ${fetchError?.message || "Unknown error"}`);
  }

  let filePath = resume.pdf_url;
  if (filePath) {
    const objectPath = getObjectPathFromPublicUrl(filePath, resumeBucketName);
    if (objectPath) {
      filePath = objectPath;
    }
  } else {
    filePath = `${user.id}/${resumeId}.pdf`;
  }

    // Debug logs to validate bucket path mapping during signed URL generation.
  console.log('[DEBUG] pdf_url from DB:', resume.pdf_url);
  console.log('[DEBUG] filePath passed to createSignedUrl:', filePath);
  console.log('[DEBUG] bucket:', resumeBucketName);

  const { data, error } = await supabase.storage
    .from(resumeBucketName)
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    console.error("Error getting signed URL:", error);
    throw new Error(`Failed to get signed URL: ${error.message}`);
  }

  if (!data?.signedUrl) {
    throw new Error("Failed to generate signed URL");
  }

  return data.signedUrl;
}

export async function deleteResume(formData: FormData) {
  const supabase = await createClient();
  const resumeBucketName = getResumeBucketName();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  if (resume.pdf_url) {
    const objectPath = getObjectPathFromPublicUrl(resume.pdf_url, resumeBucketName);
    if (objectPath) {
      await supabase.storage.from(resumeBucketName).remove([objectPath]);
    }
  }

  await supabase.from("resumes").delete().eq("id", resumeId).eq("candidate_id", user.id);

  revalidatePath("/resume");
  revalidatePath("/jobs");
}
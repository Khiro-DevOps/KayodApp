"use server";

import { createClient } from "@/lib/supabase/server";
import { getObjectPathFromPublicUrl, getResumeBucketName } from "@/lib/supabase/storage";

export async function getResumeSignedUrl(
  resumeId: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = await createClient();
  const resumeBucketName = getResumeBucketName();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data: resume, error: fetchError } = await supabase
    .from("resumes")
    .select("id, candidate_id, title, pdf_url")
    .eq("id", resumeId)
    .eq("candidate_id", user.id)
    .maybeSingle();

  if (fetchError || !resume) {
    throw new Error(`Resume not found or access denied: ${fetchError?.message ?? "Unknown error"}`);
  }

  let filePath = resume.pdf_url;
  if (filePath) {
    const objectPath = getObjectPathFromPublicUrl(filePath, resumeBucketName);
    if (objectPath) filePath = objectPath;
  } else {
    filePath = `${user.id}/${resumeId}.pdf`;
  }

  const { data, error } = await supabase.storage
    .from(resumeBucketName)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw new Error(`Failed to get signed URL: ${error.message}`);
  if (!data?.signedUrl) throw new Error("Failed to generate signed URL");

  return data.signedUrl;
}
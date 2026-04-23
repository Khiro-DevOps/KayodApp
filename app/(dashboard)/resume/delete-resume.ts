"use server";

import { createClient } from "@/lib/supabase/server";
import { getObjectPathFromPublicUrl, getResumeBucketName } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function deleteResume(formData: FormData) {
  const supabase = await createClient();
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
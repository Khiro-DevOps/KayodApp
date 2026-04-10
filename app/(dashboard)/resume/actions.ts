"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function deleteResume(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resumeId = formData.get("resume_id") as string;
  if (!resumeId) redirect("/resume");

  // Get the resume to find the storage path
  const { data: resume } = await supabase
    .from("resumes")
    .select("file_url, user_id")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .single();

  if (!resume) redirect("/resume");

  // Extract the storage path from the public URL
  const url = new URL(resume.file_url);
  const pathParts = url.pathname.split("/storage/v1/object/public/resumes/");
  if (pathParts.length > 1) {
    await supabase.storage.from("resumes").remove([pathParts[1]]);
  }

  // Delete from database
  await supabase.from("resumes").delete().eq("id", resumeId).eq("user_id", user.id);

  revalidatePath("/resume");
  revalidatePath("/jobs");
}

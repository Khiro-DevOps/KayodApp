"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get employer record
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const requirements = formData.get("requirements") as string;
  const skillsRaw = formData.get("skills") as string;
  const location = formData.get("location") as string;
  const salary_range = formData.get("salary_range") as string;

  const skills = skillsRaw
    ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const { error } = await supabase.from("job_listings").insert({
    employer_id: employer.id,
    title,
    description,
    requirements: requirements || null,
    skills,
    location: location || null,
    salary_range: salary_range || null,
  });

  if (error) {
    redirect(`/jobs/manage/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/jobs");
  redirect("/jobs/manage");
}

export async function updateJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = formData.get("job_id") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const requirements = formData.get("requirements") as string;
  const skillsRaw = formData.get("skills") as string;
  const location = formData.get("location") as string;
  const salary_range = formData.get("salary_range") as string;
  const status = formData.get("status") as string;

  const skills = skillsRaw
    ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const { error } = await supabase
    .from("job_listings")
    .update({
      title,
      description,
      requirements: requirements || null,
      skills,
      location: location || null,
      salary_range: salary_range || null,
      status: status || "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    redirect(
      `/jobs/manage/${jobId}/edit?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/jobs");
  redirect("/jobs/manage");
}

export async function deleteJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = formData.get("job_id") as string;

  await supabase.from("job_listings").delete().eq("id", jobId);

  revalidatePath("/jobs");
  redirect("/jobs/manage");
}

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

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const requirements = formData.get("requirements") as string;
  const skillsRaw = formData.get("skills") as string;
  const location = formData.get("location") as string;
  const salary_range = formData.get("salary_range") as string;
  const industry = formData.get("industry") as string;
  const job_category = formData.get("job_category") as string;

  const skills = skillsRaw
    ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const salaryMin = salary_range && salary_range.includes("-") 
    ? parseInt(salary_range.split("-")[0])
    : null;
  const salaryMax = salary_range && salary_range.includes("-")
    ? parseInt(salary_range.split("-")[1])
    : null;

  const { error } = await supabase.from("job_postings").insert({
    created_by: user.id,
    title,
    description,
    requirements: requirements || null,
    required_skills: skills || [],
    location: location || null,
    salary_min: salaryMin,
    salary_max: salaryMax,
    currency: "PHP",
    industry: industry || null,
    job_category: job_category || null,
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
  const industry = formData.get("industry") as string;
  const job_category = formData.get("job_category") as string;
  const is_published = formData.get("is_published") === "true";

  const skills = skillsRaw
    ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const salaryMin = salary_range && salary_range.includes("-") 
    ? parseInt(salary_range.split("-")[0])
    : null;
  const salaryMax = salary_range && salary_range.includes("-")
    ? parseInt(salary_range.split("-")[1])
    : null;

  const { error } = await supabase
    .from("job_postings")
    .update({
      title,
      description,
      requirements: requirements || null,
      required_skills: skills,
      location: location || null,
      salary_min: salaryMin,
      salary_max: salaryMax,
      industry: industry || null,
      job_category: job_category || null,
      is_published,
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

  await supabase.from("job_postings").delete().eq("id", jobId);

  revalidatePath("/jobs");
  redirect("/jobs/manage");
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { effectiveRole, isHRRole } from "@/lib/roles";

async function verifyHR(supabase: Awaited<ReturnType<typeof createClient>>, user: {user_metadata?: Record<string, unknown>, raw_user_meta_data?: Record<string, unknown>, id: string}): Promise<boolean> {
  const authRole =
    (user.user_metadata?.role as string | undefined) ??
    (user.raw_user_meta_data?.role as string | undefined);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("verifyHR profile fetch error:", profileError);
  }

  const role = effectiveRole(profile?.role, authRole);
  return isHRRole(role);
}

export async function createJob(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await verifyHR(supabase, user))) redirect("/dashboard");

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const work_setup = formData.get("work_setup") as string;
  const employment_type = formData.get("employment_type") as string;
  const location = formData.get("location") as string;
  const salary_range = formData.get("salary_range") as string;
  const skillsRaw = formData.get("skills") as string;

  const skills = skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const salaryMin = salary_range?.includes("-") ? parseInt(salary_range.split("-")[0]) : null;
  const salaryMax = salary_range?.includes("-") ? parseInt(salary_range.split("-")[1]) : null;

  const adminClient = getAdminClient();
  const { error } = await adminClient.from("job_postings").insert({
    created_by: user.id,
    title,
    description,
    work_setup: work_setup || "onsite",
    employment_type: employment_type || "full-time",
    location: location || null,
    salary_min: salaryMin,
    salary_max: salaryMax,
    required_skills: skills,
    currency: "PHP",
    is_published: true,
    slots: 1,
  });

  if (error) redirect(`/jobs/manage/new?error=${encodeURIComponent(error.message)}`);

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

  const adminClient = getAdminClient();
  const { error } = await adminClient
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

  const adminClient = getAdminClient();
  await adminClient.from("job_postings").delete().eq("id", jobId);

  revalidatePath("/jobs");
  redirect("/jobs/manage");
}

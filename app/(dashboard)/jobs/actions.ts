"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createJobOfferTemplate, type OfferLetterSettings } from "@/lib/docuseal";
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

  // Job Posting Fields (from Section 1)
  const title = formData.get("title") as string;
  const industry = formData.get("industry") as string;
  const job_category = formData.get("job_category") as string;
  const description = formData.get("description") as string;
  const requirements = formData.get("requirements") as string;
  const work_setup = formData.get("work_setup") as string;
  const employment_type = formData.get("employment_type") as string;
  const location = formData.get("location") as string;
  const salary_range = formData.get("salary_range") as string;
  const skillsRaw = formData.get("skills") as string;

  // Philippine Offer Letter Fields (from Section 2)
  const ph_department = formData.get("ph_department") as string;
  const ph_supervisor_name = formData.get("ph_supervisor_name") as string;
  const ph_supervisor_title = formData.get("ph_supervisor_title") as string;
  const ph_employment_status = formData.get("ph_employment_status") as string;
  const ph_probation_period_days = formData.get("ph_probation_period_days") as string;
  const ph_start_date = formData.get("ph_start_date") as string;
  const ph_work_schedule = formData.get("ph_work_schedule") as string;
  const ph_monthly_basic_salary = formData.get("ph_monthly_basic_salary") as string;
  const ph_pay_frequency = formData.get("ph_pay_frequency") as string;
  const ph_signing_bonus = formData.get("ph_signing_bonus") as string;
  const ph_transport_allowance = formData.get("ph_transport_allowance") as string;
  const ph_internet_allowance = formData.get("ph_internet_allowance") as string;
  const ph_meal_allowance = formData.get("ph_meal_allowance") as string;
  const ph_night_differential = formData.get("ph_night_differential") as string;
  const ph_service_incentive_leave = formData.get("ph_service_incentive_leave") as string;
  const ph_vacation_leave_days = formData.get("ph_vacation_leave_days") as string;
  const ph_sick_leave_days = formData.get("ph_sick_leave_days") as string;
  const ph_hmo_provider = formData.get("ph_hmo_provider") as string;

  // Process skills
  const skills = skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  // Process salary range
  const salaryMin = salary_range?.includes("-") ? parseInt(salary_range.split("-")[0]) : null;
  const salaryMax = salary_range?.includes("-") ? parseInt(salary_range.split("-")[1]) : null;

  // Build offer letter settings object from PH fields
  const offerLetterSettings: OfferLetterSettings = {
    phDepartment: ph_department || undefined,
    phSupervisorName: ph_supervisor_name || undefined,
    phSupervisorTitle: ph_supervisor_title || undefined,
    phEmploymentStatus: ph_employment_status || undefined,
    phProbationPeriodDays: ph_probation_period_days ? parseInt(ph_probation_period_days, 10) : undefined,
    phStartDate: ph_start_date || undefined,
    phWorkSchedule: ph_work_schedule || undefined,
    phMonthlyBasicSalary: ph_monthly_basic_salary ? parseFloat(ph_monthly_basic_salary) : undefined,
    phPayFrequency: ph_pay_frequency || undefined,
    phSigningBonus: ph_signing_bonus ? parseFloat(ph_signing_bonus) : undefined,
    phTransportAllowance: ph_transport_allowance ? parseFloat(ph_transport_allowance) : undefined,
    phInternetAllowance: ph_internet_allowance ? parseFloat(ph_internet_allowance) : undefined,
    phMealAllowance: ph_meal_allowance ? parseFloat(ph_meal_allowance) : undefined,
    phNightDifferential: ph_night_differential ? parseFloat(ph_night_differential) : undefined,
    phServiceIncentiveLeave: ph_service_incentive_leave ? parseInt(ph_service_incentive_leave, 10) : undefined,
    phVacationLeaveDays: ph_vacation_leave_days ? parseInt(ph_vacation_leave_days, 10) : undefined,
    phSickLeaveDays: ph_sick_leave_days ? parseInt(ph_sick_leave_days, 10) : undefined,
    phHmoProvider: ph_hmo_provider || undefined,
    phMandatory13thMonth: true, // Always true per PH law
    phSssEnrolled: true,
    phPhilhealthEnrolled: true,
    phPagibigEnrolled: true,
  };

  const adminClient = getAdminClient();
  const { data: jobData, error } = await adminClient
    .from("job_postings")
    .insert({
      created_by: user.id,
      title,
      industry: industry || null,
      job_category: job_category || null,
      description,
      requirements: requirements || null,
      work_setup: work_setup || "onsite",
      employment_type: employment_type || "full-time",
      location: location || null,
      salary_min: salaryMin,
      salary_max: salaryMax,
      required_skills: skills,
      currency: "PHP",
      is_published: true,
      slots: 1,
      offer_letter_settings: Object.keys(offerLetterSettings).length > 0 ? offerLetterSettings : null,
    })
    .select("id")
    .single();

  if (error) redirect(`/jobs/manage/new?error=${encodeURIComponent(error.message)}`);
  if (!jobData?.id) redirect(`/jobs/manage/new?error=${encodeURIComponent("Failed to create job")}`);

  // Create DocuSeal template after job is published
  if (!process.env.DOCUSEAL_API_KEY) {
    console.warn("[Job Creation] DOCUSEAL_API_KEY not set - template will be created on first offer send");
  } else {
    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!userProfile) {
        throw new Error("User profile not found");
      }

      const tenantName = userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name}`.trim() : "Company";

      console.log(`[Job Creation] Creating DocuSeal template for job: ${title}`);
      const templateId = await createJobOfferTemplate(
        {
          jobTitle: title,
          department: ph_department || job_category || undefined,
          employmentType: employment_type || "full-time",
          location: location || undefined,
          jobDescription: description,
          salary_min: salaryMin || undefined,
          salary_max: salaryMax || undefined,
          currency: "PHP",
        },
        {
          name: tenantName,
          email: userProfile.email,
        },
        Object.keys(offerLetterSettings).length > 0 ? offerLetterSettings : undefined
      );

      if (!templateId) {
        console.error("[Job Creation] Template creation returned no ID");
      } else {
        console.log(`[Job Creation] Saving template ID to job: ${templateId}`);
        // Save the template ID to the job
        const { error: updateError } = await adminClient
          .from("job_postings")
          .update({ docuseal_template_id: templateId })
          .eq("id", jobData.id);

        if (updateError) {
          console.error("[Job Creation] Failed to save template ID:", updateError);
        } else {
          console.log(`[Job Creation] Template ID saved successfully`);
        }
      }
    } catch (templateError) {
      // Log error but don't block job creation
      const errorMessage = templateError instanceof Error ? templateError.message : String(templateError);
      console.error("[Job Creation] DocuSeal template creation failed:", { errorMessage, templateError });
    }
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
    console.error("Update job error:", error);
    return { error: error.message };
  }

  revalidatePath("/jobs");
  return { success: true };
}

export async function deleteJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await verifyHR(supabase, user))) redirect("/dashboard");

  const jobId = formData.get("job_id") as string;
  if (!jobId) redirect("/jobs/manage");

  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from("job_postings")
    .delete()
    .eq("id", jobId);

  if (error) {
    console.error("Delete job error:", error);
    redirect(`/jobs/manage/${jobId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/jobs");
  revalidatePath("/jobs/manage");
  redirect("/jobs/manage");
}
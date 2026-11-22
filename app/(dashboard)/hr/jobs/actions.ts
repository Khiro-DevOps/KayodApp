"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createJobOfferTemplate, type OfferLetterSettings } from "@/lib/docuseal";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { saveJobRequiredDocuments } from "@/lib/pre-employment-actions";
import {
  computeCompensationTotals,
  parseCompensationPackage,
} from "@/lib/compensation-package";

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
  const work_mode = formData.get("work_mode") as string;
  const employment_type = formData.get("employment_type") as string;
  const work_location_id = formData.get("work_location_id") as string;
  const shift_start = formData.get("shift_start") as string;
  const shift_end = formData.get("shift_end") as string;
  const work_days = formData.getAll("work_days") as string[];
  const schedule_type = (formData.get("schedule_type") as string) || "fixed";
  const rest_days_type = (formData.get("rest_days_type") as string) || "fixed";
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

  // Additional offer defaults (benefits & terms)
  const selectedBenefits = formData.getAll("selectedBenefits") as string[];
  const offerExpiryDays = formData.get("offer_expiry_days") as string;
  const negotiationAllowed = formData.get("negotiation_allowed") === "on";
  const counterOfferAllowed = formData.get("counter_offer_allowed") === "on";
  const offerNotes = formData.get("offer_notes") as string;
  const requirementsToProceed = formData.get("requirements_to_proceed") as string;
  const requiredDocumentsJson = formData.get("required_documents_json");
  const compensationPackageRaw = formData.get("compensation_package_json");

  let parsedCompensationRaw: unknown = null;
  if (typeof compensationPackageRaw === "string" && compensationPackageRaw.trim()) {
    try {
      parsedCompensationRaw = JSON.parse(compensationPackageRaw);
    } catch {
      parsedCompensationRaw = null;
    }
  }
  const compensationPackage = parseCompensationPackage(parsedCompensationRaw);
  const compTotals = computeCompensationTotals(
    compensationPackage,
    ph_monthly_basic_salary ? parseFloat(ph_monthly_basic_salary) : 0
  );

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
    phTransportAllowance: compensationPackage.transport_allowance.enabled
      ? compensationPackage.transport_allowance.amount
      : ph_transport_allowance
        ? parseFloat(ph_transport_allowance)
        : undefined,
    phInternetAllowance: compensationPackage.internet_allowance.enabled
      ? compensationPackage.internet_allowance.amount
      : ph_internet_allowance
        ? parseFloat(ph_internet_allowance)
        : undefined,
    phMealAllowance: compensationPackage.meal_allowance.enabled
      ? compensationPackage.meal_allowance.amount
      : ph_meal_allowance
        ? parseFloat(ph_meal_allowance)
        : undefined,
    phNightDifferential: ph_night_differential ? parseFloat(ph_night_differential) : undefined,
    phServiceIncentiveLeave: ph_service_incentive_leave ? parseInt(ph_service_incentive_leave, 10) : undefined,
    phVacationLeaveDays: ph_vacation_leave_days ? parseInt(ph_vacation_leave_days, 10) : undefined,
    phSickLeaveDays: ph_sick_leave_days ? parseInt(ph_sick_leave_days, 10) : undefined,
    phHmoProvider: compensationPackage.hmo_coverage.enabled
      ? `HMO (${compensationPackage.hmo_coverage.timing === "day_1" ? "Day 1" : "Upon Regularization"})`
      : ph_hmo_provider || undefined,
    phMandatory13thMonth: compensationPackage.thirteenth_month_pay,
    phSssEnrolled: true,
    phPhilhealthEnrolled: true,
    phPagibigEnrolled: true,
    compensation_package: compensationPackage,
    monthly_allowance: compTotals.monthlyAllowancesTotal,
    attendance_incentive: compTotals.attendanceIncentiveAmount,
    // New offer defaults
    selectedBenefits:
      compTotals.selectedBenefitLabels.length > 0
        ? compTotals.selectedBenefitLabels
        : selectedBenefits && selectedBenefits.length > 0
          ? selectedBenefits
          : undefined,
    offerExpiryDays: offerExpiryDays ? parseInt(offerExpiryDays, 10) : undefined,
    negotiationAllowed: negotiationAllowed ? true : undefined,
    counterOfferAllowed: counterOfferAllowed ? true : undefined,
    offerNotes: offerNotes || undefined,
    requirementsToProceed: requirementsToProceed || undefined,
  };

  const adminClient = getAdminClient();
  const { data: creatorProfile } = await adminClient
    .from("profiles")
    .select("email, tenant_id, tenants(name)")
    .eq("id", user.id)
    .maybeSingle<{
      email?: string | null;
      tenant_id?: string | null;
      tenants?: { name?: string | null } | Array<{ name?: string | null }> | null;
    }>();

  const { data: jobData, error } = await adminClient
    .from("job_postings")
    .insert({
      created_by: user.id,
      tenant_id: creatorProfile?.tenant_id ?? null,
      title,
      industry: industry || null,
      job_category: job_category || null,
      description,
      requirements: requirements || null,
      work_setup: work_mode || "onsite",
      employment_type: employment_type || "full_time",
      work_location_id: work_location_id || null,
      shift_start: shift_start || null,
      shift_end: shift_end || null,
      work_days: work_days.length > 0 ? work_days : null,
      schedule_type,
      rest_days_type,
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

  if (jobData?.id) {
    await saveJobRequiredDocuments(jobData.id, requiredDocumentsJson);
  }

  if (error) redirect(`/hr/jobs/new?error=${encodeURIComponent(error.message)}`);
  if (!jobData?.id) redirect(`/hr/jobs/new?error=${encodeURIComponent("Failed to create job")}`);

  // Create DocuSeal template after job is published
  if (!process.env.DOCUSEAL_API_KEY) {
    console.warn("[Job Creation] DOCUSEAL_API_KEY not set - template will be created on first offer send");
  } else {
    try {
      const tenantRel = Array.isArray(creatorProfile?.tenants)
        ? creatorProfile?.tenants[0]
        : creatorProfile?.tenants;
      let tenantName = tenantRel?.name?.trim() || "";
      if (!tenantName && creatorProfile?.tenant_id) {
        const { data: tenantRow } = await adminClient
          .from("tenants")
          .select("name")
          .eq("id", creatorProfile.tenant_id)
          .maybeSingle<{ name?: string | null }>();
        tenantName = tenantRow?.name?.trim() || "";
      }
      if (!tenantName) {
        throw new Error("Company name is missing on tenant record.");
      }

      console.log(`[Job Creation] Creating DocuSeal template for job: ${title}`);
      const templateId = await createJobOfferTemplate(
        {
          jobTitle: title,
          department: ph_department || job_category || undefined,
          employmentType: employment_type || "full_time",
          location: work_location_id || undefined,
          jobDescription: description,
          salary_min: salaryMin || undefined,
          salary_max: salaryMax || undefined,
          currency: "PHP",
        },
        {
          name: tenantName,
          email: creatorProfile?.email ?? user.email ?? undefined,
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
  redirect("/hr/jobs");
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
  const work_mode = formData.get("work_mode") as string;
  const work_location_id = formData.get("work_location_id") as string;
  const shift_start = formData.get("shift_start") as string;
  const shift_end = formData.get("shift_end") as string;
  const work_days = formData.getAll("work_days") as string[];
  const schedule_type = (formData.get("schedule_type") as string) || "fixed";
  const rest_days_type = (formData.get("rest_days_type") as string) || "fixed";
  const salary_range = formData.get("salary_range") as string;
  const industry = formData.get("industry") as string;
  const job_category = formData.get("job_category") as string;
  const is_published = formData.get("is_published") === "true";
  const requiredDocumentsJson = formData.get("required_documents_json");
  const compensationPackageRaw = formData.get("compensation_package_json");
  const ph_department = formData.get("ph_department") as string;
  const ph_supervisor_name = formData.get("ph_supervisor_name") as string;
  const ph_supervisor_title = formData.get("ph_supervisor_title") as string;
  const ph_employment_status = formData.get("ph_employment_status") as string;
  const ph_probation_period_days = formData.get("ph_probation_period_days") as string;
  const ph_start_date = formData.get("ph_start_date") as string;
  const ph_monthly_basic_salary = formData.get("ph_monthly_basic_salary") as string;

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
  const { data: existingJob } = await adminClient
    .from("job_postings")
    .select("offer_letter_settings")
    .eq("id", jobId)
    .maybeSingle();

  let parsedCompensationRaw: unknown = null;
  if (typeof compensationPackageRaw === "string" && compensationPackageRaw.trim()) {
    try {
      parsedCompensationRaw = JSON.parse(compensationPackageRaw);
    } catch {
      parsedCompensationRaw = null;
    }
  }
  const existingSettings = (existingJob?.offer_letter_settings ?? {}) as Record<string, unknown>;
  const compensationPackage = parseCompensationPackage(
    parsedCompensationRaw ?? existingSettings.compensation_package,
    existingSettings
  );
  const compTotals = computeCompensationTotals(
    compensationPackage,
    ph_monthly_basic_salary
      ? parseFloat(ph_monthly_basic_salary)
      : Number(existingSettings.phMonthlyBasicSalary ?? salaryMin ?? 0) || 0
  );

  const updatedOfferLetterSettings: OfferLetterSettings = {
    ...(existingSettings as OfferLetterSettings),
    ...(ph_department ? { phDepartment: ph_department } : {}),
    ...(ph_supervisor_name ? { phSupervisorName: ph_supervisor_name } : {}),
    ...(ph_supervisor_title ? { phSupervisorTitle: ph_supervisor_title } : {}),
    ...(ph_employment_status ? { phEmploymentStatus: ph_employment_status } : {}),
    ...(ph_probation_period_days
      ? { phProbationPeriodDays: parseInt(ph_probation_period_days, 10) }
      : {}),
    ...(ph_start_date ? { phStartDate: ph_start_date } : {}),
    ...(ph_monthly_basic_salary
      ? { phMonthlyBasicSalary: parseFloat(ph_monthly_basic_salary) }
      : {}),
    phMandatory13thMonth: compensationPackage.thirteenth_month_pay,
    compensation_package: compensationPackage,
    monthly_allowance: compTotals.monthlyAllowancesTotal,
    attendance_incentive: compTotals.attendanceIncentiveAmount,
    selectedBenefits: compTotals.selectedBenefitLabels,
  };

  const { error } = await adminClient
    .from("job_postings")
    .update({
      title,
      description,
      requirements: requirements || null,
      required_skills: skills,
      work_setup: work_mode || "onsite",
      work_location_id: work_location_id || null,
      shift_start: shift_start || null,
      shift_end: shift_end || null,
      work_days: work_days.length > 0 ? work_days : null,
      schedule_type,
      rest_days_type,
      salary_min: salaryMin,
      salary_max: salaryMax,
      industry: industry || null,
      job_category: job_category || null,
      is_published,
      offer_letter_settings: updatedOfferLetterSettings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("Update job error:", error);
    redirect(`/hr/jobs/${jobId}?error=${encodeURIComponent(error.message)}`);
  }

  await saveJobRequiredDocuments(jobId, requiredDocumentsJson);

  revalidatePath("/jobs");
  revalidatePath(`/hr/jobs/${jobId}`);
  redirect(`/hr/jobs/${jobId}`);
}

export async function deleteJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await verifyHR(supabase, user))) redirect("/dashboard");

  const jobId = formData.get("job_id") as string;
  if (!jobId) redirect("/hr/jobs");

  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from("job_postings")
    .delete()
    .eq("id", jobId);

  if (error) {
    console.error("Delete job error:", error);
    redirect(`/hr/jobs/${jobId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/jobs");
  revalidatePath("/hr/jobs");
  redirect("/hr/jobs");
}
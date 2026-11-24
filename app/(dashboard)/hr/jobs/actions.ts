"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createJobOfferTemplate, type OfferLetterSettings } from "@/lib/docuseal";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext, requireHrPermission } from "@/lib/rbac/server";
import { saveJobRequiredDocuments } from "@/lib/pre-employment-actions";
import { computeJobHeadcount } from "@/lib/job-headcount";
import { fetchOnlineHiredCountsByJob } from "@/lib/job-headcount-server";
import { JOB_LEVEL_LABELS, normalizeJobLevel } from "@/lib/workforce-hierarchy";
import {
  computeCompensationTotals,
  parseCompensationPackage,
} from "@/lib/compensation-package";
import {
  buildWorkScheduleSummary,
  clampWorkDaysPerWeek,
  mapRestDaysPolicyToLegacyType,
  normalizeRestDaysPolicy,
  normalizeScheduleType,
  normalizeShiftRotationPattern,
  normalizeShortWorkDays,
  resolveDefaultWorkDaysForCount,
} from "@/lib/schedule-policy";
import {
  formatLeaveCreditsDisplay,
  normalizeLeavePolicyConfig,
} from "@/lib/leave-policy";

export async function createJob(formData: FormData) {
  const ctx = await requireHrPermission("jobs:manage");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Job Posting Fields (from Section 1)
  const title = formData.get("title") as string;
  const industry = formData.get("industry") as string;
  const target_job_level = normalizeJobLevel(formData.get("target_job_level") as string | null);
  const job_category = JOB_LEVEL_LABELS[target_job_level];
  const description = formData.get("description") as string;
  const requirements = formData.get("requirements") as string;
  const work_mode = formData.get("work_mode") as string;
  const employment_type = formData.get("employment_type") as string;
  const work_location_id = formData.get("work_location_id") as string;
  const shift_start = (formData.get("shift_start") as string) || "08:00";
  const shift_end = (formData.get("shift_end") as string) || "17:00";
  const raw_work_days = normalizeShortWorkDays(formData.getAll("work_days") as string[]);
  const schedule_type = normalizeScheduleType(formData.get("schedule_type"));
  const work_days_per_week = clampWorkDaysPerWeek(
    formData.get("work_days_per_week") ?? formData.get("work_days_count"),
    raw_work_days.length > 0 ? raw_work_days.length : 5
  );
  const rest_days_policy = normalizeRestDaysPolicy(
    formData.get("rest_days_policy") ?? formData.get("rest_days_type"),
    schedule_type
  );
  const rest_days_type = mapRestDaysPolicyToLegacyType(rest_days_policy);
  const shift_rotation_pattern = normalizeShiftRotationPattern(
    formData.get("shift_rotation_pattern"),
    schedule_type
  );
  const work_days =
    raw_work_days.length > 0
      ? raw_work_days
      : schedule_type === "rotating"
        ? resolveDefaultWorkDaysForCount(work_days_per_week)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const work_schedule_summary = buildWorkScheduleSummary({
    scheduleType: schedule_type,
    workDaysPerWeek: work_days_per_week,
    restDaysPolicy: rest_days_policy,
    shiftRotationPattern: shift_rotation_pattern,
    shiftStart: shift_start,
    shiftEnd: shift_end,
    workDays: work_days,
  });
  const salary_range = formData.get("salary_range") as string;
  const skillsRaw = formData.get("skills") as string;
  const rawSlots = Number(formData.get("slots"));
  const slots = Number.isFinite(rawSlots) && rawSlots >= 1 ? Math.floor(rawSlots) : 1;
  const department_id = (formData.get("department_id") as string)?.trim() || null;
  const default_supervisor_id = (formData.get("default_supervisor_id") as string)?.trim() || null;

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

  // Phase 2 structured leave policy fields
  const leavePolicy = normalizeLeavePolicyConfig({
    leave_policy_type: formData.get("leave_policy_type"),
    vacation_leave_days: formData.get("vacation_leave_days") ?? ph_vacation_leave_days,
    sick_leave_days: formData.get("sick_leave_days") ?? ph_sick_leave_days,
    service_incentive_leave_days:
      formData.get("service_incentive_leave_days") ?? ph_service_incentive_leave,
    leave_eligibility: formData.get("leave_eligibility"),
  });
  const leaveCreditsSummary = formatLeaveCreditsDisplay(leavePolicy);

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
    department: ph_department || undefined,
    supervisor_name: ph_supervisor_name || undefined,
    supervisor_title: ph_supervisor_title || undefined,
    employment_status: ph_employment_status || undefined,
    probation_days: ph_probation_period_days ? parseInt(ph_probation_period_days, 10) : undefined,
    expected_start_date: ph_start_date || undefined,
    phWorkSchedule: ph_work_schedule || work_schedule_summary || undefined,
    schedule_type,
    work_days_per_week,
    rest_days_policy,
    shift_rotation_pattern,
    shift_start: shift_start || "08:00",
    shift_end: shift_end || "17:00",
    work_days,
    work_schedule_summary,
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
    phServiceIncentiveLeave: leavePolicy.service_incentive_leave_days,
    phVacationLeaveDays: leavePolicy.vacation_leave_days,
    phSickLeaveDays: leavePolicy.sick_leave_days,
    leave_policy_type: leavePolicy.leave_policy_type,
    vacation_leave_days: leavePolicy.vacation_leave_days,
    sick_leave_days: leavePolicy.sick_leave_days,
    service_incentive_leave_days: leavePolicy.service_incentive_leave_days,
    leave_eligibility: leavePolicy.leave_eligibility,
    leave_credits_summary: leaveCreditsSummary,
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
  const [{ data: creatorProfile }, { data: selectedBranch }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("email, tenant_id, tenants(name)")
      .eq("id", user.id)
      .maybeSingle<{
        email?: string | null;
        tenant_id?: string | null;
        tenants?: { name?: string | null } | Array<{ name?: string | null }> | null;
      }>(),
    work_location_id && work_mode !== "remote"
      ? adminClient
          .from("office_branches")
          .select("name, address")
          .eq("id", work_location_id)
          .maybeSingle<{ name: string; address?: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  const formattedLocation =
    work_mode === "remote"
      ? "Remote"
      : selectedBranch
        ? selectedBranch.address
          ? `${selectedBranch.name} — ${selectedBranch.address}`
          : selectedBranch.name
        : null;

  const { data: jobData, error } = await adminClient
    .from("job_postings")
    .insert({
      created_by: user.id,
      tenant_id: creatorProfile?.tenant_id ?? ctx.tenant_id ?? null,
      title,
      industry: industry || null,
      job_category: job_category || null,
      department_id,
      default_supervisor_id,
      target_job_level,
      description,
      requirements: requirements || null,
      work_setup: work_mode || "onsite",
      employment_type: employment_type || "full_time",
      work_location_id: work_location_id || null,
      location: formattedLocation,
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
      slots,
      hired_walkin_count: 0,
      leave_policy_type: leavePolicy.leave_policy_type,
      vacation_leave_days: leavePolicy.vacation_leave_days,
      sick_leave_days: leavePolicy.sick_leave_days,
      service_incentive_leave_days: leavePolicy.service_incentive_leave_days,
      leave_eligibility: leavePolicy.leave_eligibility,
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
  await requireHrPermission("jobs:manage");
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
  const rawSlots = Number(formData.get("slots"));
  const slots = Number.isFinite(rawSlots) && rawSlots >= 1 ? Math.floor(rawSlots) : 1;
  const department_id = (formData.get("department_id") as string)?.trim() || null;
  const default_supervisor_id = (formData.get("default_supervisor_id") as string)?.trim() || null;
  const work_mode = formData.get("work_mode") as string;
  const work_location_id = formData.get("work_location_id") as string;
  const shift_start = (formData.get("shift_start") as string) || "08:00";
  const shift_end = (formData.get("shift_end") as string) || "17:00";
  const raw_work_days = normalizeShortWorkDays(formData.getAll("work_days") as string[]);
  const schedule_type = normalizeScheduleType(formData.get("schedule_type"));
  const work_days_per_week = clampWorkDaysPerWeek(
    formData.get("work_days_per_week") ?? formData.get("work_days_count"),
    raw_work_days.length > 0 ? raw_work_days.length : 5
  );
  const rest_days_policy = normalizeRestDaysPolicy(
    formData.get("rest_days_policy") ?? formData.get("rest_days_type"),
    schedule_type
  );
  const rest_days_type = mapRestDaysPolicyToLegacyType(rest_days_policy);
  const shift_rotation_pattern = normalizeShiftRotationPattern(
    formData.get("shift_rotation_pattern"),
    schedule_type
  );
  const work_days =
    raw_work_days.length > 0
      ? raw_work_days
      : schedule_type === "rotating"
        ? resolveDefaultWorkDaysForCount(work_days_per_week)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const work_schedule_summary = buildWorkScheduleSummary({
    scheduleType: schedule_type,
    workDaysPerWeek: work_days_per_week,
    restDaysPolicy: rest_days_policy,
    shiftRotationPattern: shift_rotation_pattern,
    shiftStart: shift_start,
    shiftEnd: shift_end,
    workDays: work_days,
  });
  const salary_range = formData.get("salary_range") as string;
  const industry = formData.get("industry") as string;
  const target_job_level = normalizeJobLevel(formData.get("target_job_level") as string | null);
  const job_category = JOB_LEVEL_LABELS[target_job_level];
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

  const leavePolicy = normalizeLeavePolicyConfig({
    leave_policy_type: formData.get("leave_policy_type"),
    vacation_leave_days: formData.get("vacation_leave_days"),
    sick_leave_days: formData.get("sick_leave_days"),
    service_incentive_leave_days: formData.get("service_incentive_leave_days"),
    leave_eligibility: formData.get("leave_eligibility"),
  });
  const leaveCreditsSummary = formatLeaveCreditsDisplay(leavePolicy);

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
  const [{ data: existingJob }, onlineHiredMap] = await Promise.all([
    adminClient
      .from("job_postings")
      .select("offer_letter_settings, hired_walkin_count")
      .eq("id", jobId)
      .maybeSingle(),
    fetchOnlineHiredCountsByJob([jobId]),
  ]);

  const onlineHiredCount = onlineHiredMap[jobId] ?? 0;
  const hiredWalkinCount = existingJob?.hired_walkin_count ?? 0;
  const minimumSlots = onlineHiredCount + hiredWalkinCount;
  if (slots < minimumSlots) {
    redirect(
      `/hr/jobs/${jobId}/edit?error=${encodeURIComponent(
        `Slots cannot be lower than current hired headcount (${minimumSlots}: ${onlineHiredCount} online + ${hiredWalkinCount} walk-in).`
      )}`
    );
  }

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
    phDepartment: ph_department || undefined,
    phSupervisorName: ph_supervisor_name || undefined,
    phSupervisorTitle: ph_supervisor_title || undefined,
    ...(ph_employment_status ? { phEmploymentStatus: ph_employment_status } : {}),
    ...(ph_probation_period_days
      ? { phProbationPeriodDays: parseInt(ph_probation_period_days, 10) }
      : {}),
    ...(ph_start_date ? { phStartDate: ph_start_date } : {}),
    department: ph_department || undefined,
    supervisor_name: ph_supervisor_name || undefined,
    supervisor_title: ph_supervisor_title || undefined,
    ...(ph_employment_status ? { employment_status: ph_employment_status } : {}),
    ...(ph_probation_period_days
      ? { probation_days: parseInt(ph_probation_period_days, 10) }
      : {}),
    ...(ph_start_date ? { expected_start_date: ph_start_date } : {}),
    ...(ph_monthly_basic_salary
      ? { phMonthlyBasicSalary: parseFloat(ph_monthly_basic_salary) }
      : {}),
    phMandatory13thMonth: compensationPackage.thirteenth_month_pay,
    compensation_package: compensationPackage,
    monthly_allowance: compTotals.monthlyAllowancesTotal,
    attendance_incentive: compTotals.attendanceIncentiveAmount,
    selectedBenefits: compTotals.selectedBenefitLabels,
    schedule_type,
    work_days_per_week,
    rest_days_policy,
    shift_rotation_pattern,
    shift_start: shift_start || "08:00",
    shift_end: shift_end || "17:00",
    work_days,
    work_schedule_summary,
    phWorkSchedule: work_schedule_summary,
    leave_policy_type: leavePolicy.leave_policy_type,
    vacation_leave_days: leavePolicy.vacation_leave_days,
    sick_leave_days: leavePolicy.sick_leave_days,
    service_incentive_leave_days: leavePolicy.service_incentive_leave_days,
    leave_eligibility: leavePolicy.leave_eligibility,
    leave_credits_summary: leaveCreditsSummary,
    phVacationLeaveDays: leavePolicy.vacation_leave_days,
    phSickLeaveDays: leavePolicy.sick_leave_days,
    phServiceIncentiveLeave: leavePolicy.service_incentive_leave_days,
  };

  const { data: updatedBranch } =
    work_location_id && work_mode !== "remote"
      ? await adminClient
          .from("office_branches")
          .select("name, address")
          .eq("id", work_location_id)
          .maybeSingle<{ name: string; address?: string | null }>()
      : { data: null };

  const formattedUpdatedLocation =
    work_mode === "remote"
      ? "Remote"
      : updatedBranch
        ? updatedBranch.address
          ? `${updatedBranch.name} — ${updatedBranch.address}`
          : updatedBranch.name
        : null;

  const { error } = await adminClient
    .from("job_postings")
    .update({
      title,
      description,
      requirements: requirements || null,
      required_skills: skills,
      work_setup: work_mode || "onsite",
      work_location_id: work_location_id || null,
      location: formattedUpdatedLocation,
      shift_start: shift_start || null,
      shift_end: shift_end || null,
      work_days: work_days.length > 0 ? work_days : null,
      schedule_type,
      rest_days_type,
      salary_min: salaryMin,
      salary_max: salaryMax,
      industry: industry || null,
      job_category: job_category || null,
      department_id,
      default_supervisor_id,
      target_job_level,
      slots,
      is_published,
      leave_policy_type: leavePolicy.leave_policy_type,
      vacation_leave_days: leavePolicy.vacation_leave_days,
      sick_leave_days: leavePolicy.sick_leave_days,
      service_incentive_leave_days: leavePolicy.service_incentive_leave_days,
      leave_eligibility: leavePolicy.leave_eligibility,
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
  await requireHrPermission("jobs:manage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

export async function updateWalkInHireCount(input: {
  jobId: string;
  nextWalkInCount: number;
  note?: string;
}): Promise<{
  success: boolean;
  error?: string;
  hired_walkin_count?: number;
  remainingSlots?: number;
}> {
  const ctx = await getHrSessionContext();
  if (!ctx) {
    return { success: false, error: "Not authenticated" };
  }

  const canManageWalkIn =
    canHr(ctx.hr_role, "jobs:manage", ctx.is_tenant_owner) ||
    canHr(ctx.hr_role, "hires:confirm", ctx.is_tenant_owner);

  if (!canManageWalkIn) {
    return {
      success: false,
      error: "Forbidden: Only Recruiters, HR Generalists, or HR Admins can update walk-in hires.",
    };
  }

  const { jobId, nextWalkInCount, note } = input;
  if (!jobId) {
    return { success: false, error: "Missing job ID" };
  }

  const admin = getAdminClient();
  const [{ data: job, error: jobErr }, onlineMap] = await Promise.all([
    admin
      .from("job_postings")
      .select("id, tenant_id, slots, hired_walkin_count, offer_letter_settings")
      .eq("id", jobId)
      .maybeSingle(),
    fetchOnlineHiredCountsByJob([jobId]),
  ]);

  if (jobErr || !job) {
    return { success: false, error: jobErr?.message || "Job posting not found" };
  }

  if (ctx.tenant_id && job.tenant_id && ctx.tenant_id !== job.tenant_id) {
    return { success: false, error: "Forbidden: Cross-tenant job update not allowed" };
  }

  const onlineHiredCount = onlineMap[jobId] ?? 0;
  const slots = Math.max(1, Number(job.slots ?? 1) || 1);
  const maxWalkIn = Math.max(slots - onlineHiredCount, 0);

  if (!Number.isInteger(nextWalkInCount) || nextWalkInCount < 0 || nextWalkInCount > maxWalkIn) {
    return {
      success: false,
      error: `Walk-in count must be between 0 and ${maxWalkIn}.`,
    };
  }

  const existingSettings = (job.offer_letter_settings ?? {}) as Record<string, unknown>;
  const trimmedNote = note?.trim();
  const existingLogs = Array.isArray(existingSettings.walk_in_logs)
    ? (existingSettings.walk_in_logs as Array<Record<string, unknown>>)
    : [];

  const updatedSettings = trimmedNote
    ? {
        ...existingSettings,
        walk_in_logs: [
          {
            previous_count: job.hired_walkin_count ?? 0,
            new_count: nextWalkInCount,
            note: trimmedNote,
            updated_by: ctx.id,
            updated_at: new Date().toISOString(),
          },
          ...existingLogs,
        ].slice(0, 25),
      }
    : existingSettings;

  const { error: updateError } = await admin
    .from("job_postings")
    .update({
      hired_walkin_count: nextWalkInCount,
      ...(trimmedNote ? { offer_letter_settings: updatedSettings } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const summary = computeJobHeadcount({
    slots,
    onlineHiredCount,
    hiredWalkinCount: nextWalkInCount,
  });

  revalidatePath("/hr/jobs");
  revalidatePath(`/hr/jobs/${jobId}/applicants`);
  revalidatePath("/jobs");

  return {
    success: true,
    hired_walkin_count: nextWalkInCount,
    remainingSlots: summary.remainingSlots,
  };
}

export async function closeJobPosting(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getHrSessionContext();
  if (!ctx) {
    return { success: false, error: "Not authenticated" };
  }

  const canClose =
    canHr(ctx.hr_role, "jobs:manage", ctx.is_tenant_owner) ||
    canHr(ctx.hr_role, "hires:confirm", ctx.is_tenant_owner);

  if (!canClose) {
    return { success: false, error: "Forbidden" };
  }

  const admin = getAdminClient();
  const { data: job } = await admin
    .from("job_postings")
    .select("id, tenant_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    return { success: false, error: "Job posting not found" };
  }

  if (ctx.tenant_id && job.tenant_id && ctx.tenant_id !== job.tenant_id) {
    return { success: false, error: "Forbidden" };
  }

  const { error } = await admin
    .from("job_postings")
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/hr/jobs");
  revalidatePath(`/hr/jobs/${jobId}/applicants`);
  revalidatePath("/jobs");

  return { success: true };
}
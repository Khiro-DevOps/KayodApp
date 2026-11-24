"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendOfferWithDocuSeal } from "../../(dashboard)/hr/jobs/[id]/applicants/[appId]/offer/send-with-docuseal-actions";
import { createSignedDocumentPlaceholderWithTemplateFallback } from "@/lib/contract-template-compat";
import {
  computeCompensationTotals,
  parseCompensationPackage,
} from "@/lib/compensation-package";
import {
  formatSupervisorDisplayLabel,
  JOB_LEVEL_LABELS,
  normalizeJobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
import { fetchDepartmentsAndSupervisors } from "@/lib/job-headcount-server";
import { canHr, type HrSubRole } from "@/lib/rbac/permissions";
import { getHrSessionContext, requireHrPermission } from "@/lib/rbac/server";
import { notifyTenantOfferDecisionMakers, sendNotification } from "@/lib/notifications";
import {
  buildWorkScheduleSummary,
  clampWorkDaysPerWeek,
  normalizeRestDaysPolicy,
  normalizeScheduleType,
  normalizeShiftRotationPattern,
  normalizeShortWorkDays,
  resolveDefaultWorkDaysForCount,
  type RestDaysPolicy,
  type ScheduleType,
  type ShiftRotationPattern,
} from "@/lib/schedule-policy";

export async function sendHydratedOffer(jobId: string, applicationId: string) {
  const supabase = await createClient();
  const admin = getAdminClient();

  console.log("[sendHydratedOffer] Starting offer creation flow", {
    jobId,
    applicationId,
    timestamp: new Date().toISOString(),
  });

  // 1. Fetch Job Listing configuration (Template Data)
  const { data: job, error: jobError } = await supabase
    .from("job_postings")
    .select(
      "title, tenant_id, department_id, work_setup, salary_min, target_job_level, default_supervisor_id, shift_start, shift_end, work_days, schedule_type, rest_days_type, default_supervisor:employees!default_supervisor_id(id, job_title, job_level, profile:profiles!profile_id(first_name, last_name)), offer_letter_settings, docuseal_template_id, created_by"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("Job fetch error:", jobError);
    throw new Error("Failed to fetch job blueprint");
  }

  let resolvedTenantId = (job as { tenant_id?: string | null }).tenant_id ?? null;
  if (!resolvedTenantId && job.created_by) {
    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", job.created_by)
      .maybeSingle();
    resolvedTenantId = creatorProfile?.tenant_id ?? null;
  }

  const { data: creatorTenant } = resolvedTenantId
    ? await admin.from("tenants").select("name").eq("id", resolvedTenantId).maybeSingle()
    : { data: null };

  const tenantName = creatorTenant?.name?.trim() || null;

  // Retire any existing active offers so a replacement can be created safely.
  const { error: archiveError } = await admin
    .from("job_offers")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("application_id", applicationId)
    .eq("is_active", true);

  if (archiveError) {
    throw new Error(`Failed to archive existing active offers: ${archiveError.message}`);
  }

  // Get current user id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Must be logged in to create an offer");
  }

  // 2. Hydrate the initial Offer Record and set state to DRAFT
  const baseSalary = Number(job.offer_letter_settings?.phMonthlyBasicSalary || job.salary_min || 0) || 0;
  const offerSettings = (job.offer_letter_settings ?? null) as Record<string, unknown> | null;
  const compensationPackage = parseCompensationPackage(
    offerSettings?.compensation_package,
    offerSettings
  );
  const compTotals = computeCompensationTotals(compensationPackage, baseSalary);
  const monthlyAllowance =
    compTotals.monthlyAllowancesTotal > 0
      ? compTotals.monthlyAllowancesTotal
      : Math.max(
          0,
          Number(
            job.offer_letter_settings?.monthly_allowance ??
              job.offer_letter_settings?.phMonthlyAllowance ??
              0
          ) || 0
        );
  const attendanceIncentive =
    compTotals.attendanceIncentiveAmount > 0
      ? compTotals.attendanceIncentiveAmount
      : Math.max(
          0,
          Number(
            job.offer_letter_settings?.attendance_incentive ??
              job.offer_letter_settings?.phAttendanceIncentive ??
              0
          ) || 0
        );

  const resolvedStartDate =
    (typeof offerSettings?.expected_start_date === "string" && offerSettings.expected_start_date) ||
    job.offer_letter_settings?.phStartDate ||
    null;
  const resolvedDepartment =
    (typeof offerSettings?.department === "string" && offerSettings.department) ||
    job.offer_letter_settings?.phDepartment ||
    null;
  const resolvedProbationDays =
    Number(offerSettings?.probation_days ?? job.offer_letter_settings?.phProbationPeriodDays ?? 180) || 180;
  const resolvedSupervisorName =
    (typeof offerSettings?.supervisor_name === "string" && offerSettings.supervisor_name) ||
    (typeof offerSettings?.phSupervisorName === "string" && offerSettings.phSupervisorName) ||
    null;
  const resolvedSupervisorTitle =
    (typeof offerSettings?.supervisor_title === "string" && offerSettings.supervisor_title) ||
    (typeof offerSettings?.phSupervisorTitle === "string" && offerSettings.phSupervisorTitle) ||
    null;

  const jobWithSched = job as typeof job & {
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    schedule_type?: string | null;
    rest_days_type?: string | null;
  };
  const resolvedScheduleType = normalizeScheduleType(
    offerSettings?.schedule_type ?? jobWithSched.schedule_type
  );
  const resolvedShiftStart =
    (typeof jobWithSched.shift_start === "string" && jobWithSched.shift_start) ||
    (typeof offerSettings?.shift_start === "string" && offerSettings.shift_start) ||
    "08:00";
  const resolvedShiftEnd =
    (typeof jobWithSched.shift_end === "string" && jobWithSched.shift_end) ||
    (typeof offerSettings?.shift_end === "string" && offerSettings.shift_end) ||
    "17:00";
  const rawResolvedWorkDays = normalizeShortWorkDays(
    Array.isArray(jobWithSched.work_days) && jobWithSched.work_days.length > 0
      ? jobWithSched.work_days
      : offerSettings?.work_days
  );
  const resolvedWorkDaysPerWeek = clampWorkDaysPerWeek(
    offerSettings?.work_days_per_week,
    rawResolvedWorkDays.length > 0 ? rawResolvedWorkDays.length : 5
  );
  const resolvedRestDaysPolicy = normalizeRestDaysPolicy(
    offerSettings?.rest_days_policy ?? jobWithSched.rest_days_type,
    resolvedScheduleType
  );
  const resolvedShiftRotationPattern = normalizeShiftRotationPattern(
    offerSettings?.shift_rotation_pattern,
    resolvedScheduleType
  );
  const resolvedWorkDays =
    rawResolvedWorkDays.length > 0
      ? rawResolvedWorkDays
      : resolvedScheduleType === "rotating"
        ? resolveDefaultWorkDaysForCount(resolvedWorkDaysPerWeek)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const workScheduleSummary = buildWorkScheduleSummary({
    scheduleType: resolvedScheduleType,
    workDaysPerWeek: resolvedWorkDaysPerWeek,
    restDaysPolicy: resolvedRestDaysPolicy,
    shiftRotationPattern: resolvedShiftRotationPattern,
    shiftStart: resolvedShiftStart,
    shiftEnd: resolvedShiftEnd,
    workDays: resolvedWorkDays,
  });

  const { data: offer, error: offerError } = await admin
    .from("job_offers")
    .insert({
      application_id: applicationId,
      job_posting_id: jobId,
      status: "DRAFT",
      version_id: 1,
      is_active: true,
      created_by: user.id,

      salary: baseSalary,
      start_date: resolvedStartDate,
      work_mode: job.work_setup || 'onsite',
      work_location_id: typeof offerSettings?.work_location_id === "string" ? offerSettings.work_location_id : null,
      shift_start: resolvedShiftStart,
      shift_end: resolvedShiftEnd,
      work_days: resolvedWorkDays,
      department: resolvedDepartment,
      probation_days: resolvedProbationDays,
      financial_package: {
        offered_salary: baseSalary,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
      },
      job_metadata: {
        company_name: tenantName,
        start_date: resolvedStartDate,
        expected_start_date: resolvedStartDate,
        job_title: job.title,
        target_job_level: normalizeJobLevel((job as { target_job_level?: string | null }).target_job_level),
        supervisor_name: resolvedSupervisorName,
        supervisor_title: resolvedSupervisorTitle,
        reports_to_employee_id: (job as { default_supervisor_id?: string | null }).default_supervisor_id ?? null,
        reports_to_label:
          formatSupervisorDisplayLabel(
            Array.isArray((job as { default_supervisor?: unknown }).default_supervisor)
              ? ((job as { default_supervisor?: unknown[] }).default_supervisor?.[0] as Parameters<typeof formatSupervisorDisplayLabel>[0])
              : ((job as { default_supervisor?: unknown }).default_supervisor as Parameters<typeof formatSupervisorDisplayLabel>[0])
          ) ||
          (resolvedSupervisorName
            ? resolvedSupervisorTitle
              ? `${resolvedSupervisorName} — ${resolvedSupervisorTitle}`
              : resolvedSupervisorName
            : null),
        reports_to:
          formatSupervisorDisplayLabel(
            Array.isArray((job as { default_supervisor?: unknown }).default_supervisor)
              ? ((job as { default_supervisor?: unknown[] }).default_supervisor?.[0] as Parameters<typeof formatSupervisorDisplayLabel>[0])
              : ((job as { default_supervisor?: unknown }).default_supervisor as Parameters<typeof formatSupervisorDisplayLabel>[0])
          ) ||
          (resolvedSupervisorName
            ? resolvedSupervisorTitle
              ? `${resolvedSupervisorName} — ${resolvedSupervisorTitle}`
              : resolvedSupervisorName
            : null),
        benefits:
          compTotals.selectedBenefitLabels.length > 0
            ? compTotals.selectedBenefitLabels
            : job.offer_letter_settings?.selectedBenefits ?? null,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
        service_incentive_leave:
          Number(offerSettings?.service_incentive_leave ?? offerSettings?.phServiceIncentiveLeave ?? 5) || 5,
        vacation_leave_days:
          Number(offerSettings?.vacation_leave_days ?? offerSettings?.phVacationLeaveDays ?? 0) || 0,
        sick_leave_days:
          Number(offerSettings?.sick_leave_days ?? offerSettings?.phSickLeaveDays ?? 0) || 0,
        hmo_provider:
          (typeof offerSettings?.hmo_provider === "string" && offerSettings.hmo_provider.trim()) ||
          (typeof offerSettings?.phHmoProvider === "string" && offerSettings.phHmoProvider.trim()) ||
          null,
        schedule_type: resolvedScheduleType,
        work_days_per_week: resolvedWorkDaysPerWeek,
        rest_days_policy: resolvedRestDaysPolicy,
        shift_rotation_pattern: resolvedShiftRotationPattern,
        shift_start: resolvedShiftStart,
        shift_end: resolvedShiftEnd,
        work_days: resolvedWorkDays,
        work_schedule_summary: workScheduleSummary,
      },
    })
    .select()
    .single();

  if (offerError) {
    console.error("Offer creation error:", offerError);
    throw new Error(`Failed to generate offer: ${offerError.message}`);
  }

  // 3. Dispatch the external DocuSeal contract automatically using modern flow
  const sendResult = await sendOfferWithDocuSeal(jobId, applicationId, offer.id);
  if (!sendResult.success) {
    console.error(`DocuSeal integration failed: ${sendResult.error}`);
    // Rollback the offer creation so the user can retry without state corruption
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error(`Failed to send contract via DocuSeal: ${sendResult.error}`);
  }

  const { data: linkedApplication } = await admin
    .from("applications")
    .select("contract_offer_id")
    .eq("id", applicationId)
    .single();

  const linkedSignedDocumentId = linkedApplication?.contract_offer_id ?? null;

  if (linkedSignedDocumentId) {
    const { error: offerUpdateError } = await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (offerUpdateError) {
      throw new Error(`DocuSeal submission was created, but the job offer status could not be updated: ${offerUpdateError.message}`);
    }

    if (!sendResult.handoverNotified && resolvedTenantId) {
      await notifyTenantOfferDecisionMakers({
        tenantId: resolvedTenantId,
        excludeUserId: user.id,
        type: "offer_letter",
        title: `Offer Handover: Standard Offer Sent (${job.title || "Job Role"})`,
        body: `A standard job offer was sent for ${job.title || "the role"}. Review the outgoing contract for oversight.`,
        actionUrl: `/hr/offers/${offer.id}`,
        senderId: user.id,
        actionName: "sendHydratedOffer",
      });
    }

    revalidatePath(`/hr/jobs/${jobId}`);
    revalidatePath(`/hr/jobs/${jobId}/applicants`);
    revalidatePath(`/job-offer/${applicationId}`);
    revalidatePath(`/job-offer/${offer.id}`);
    revalidatePath(`/offer-signing`);
    revalidatePath(`/applications/${applicationId}`);

    return {
      success: true,
      offerId: offer.id,
      signedDocId: linkedSignedDocumentId,
      docusealUrl: sendResult.url ?? null,
    };
  }

  // At this point the external DocuSeal submission was created; finalize by creating
  // a signed_documents row and only then update job_offers + applications. If any
  // of these steps fail, rollback the created job_offers to avoid a partial state
  // where application.status === 'offer_sent' but no offer exists.

  // Create a signed_documents placeholder using the same minimal shape as the working legacy flow.
  let signedDocId: string;
  try {
    const result = await createSignedDocumentPlaceholderWithTemplateFallback(admin, {
      applicationId,
      jobPostingId: jobId,
      docusealTemplateId: String(job.docuseal_template_id || "").trim(),
      createdBy: job.created_by,
      signingMethod: "digital",
      status: "sent",
      metadata: {
        job_offer_id: offer.id,
      },
    });

    signedDocId = result.signedDocumentId;
  } catch (signedDocError) {
    // Rollback created job offer to avoid partial state
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error(
      `Failed to create signed_documents placeholder: ${signedDocError instanceof Error ? signedDocError.message : "unknown error"}`
    );
  }

  const docusealUrl = sendResult.url ?? null;

  // Update signed_documents, mark job_offer as SENT, then update applications.
  try {
    const { error: signedDocumentUpdateError } = await admin
      .from("signed_documents")
      .update({
        docuseal_submission_url: docusealUrl,
        metadata: {
          job_offer_id: offer.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", signedDocId);

    if (signedDocumentUpdateError) {
      throw new Error(`DocuSeal submission was created, but the signed document record could not be updated: ${signedDocumentUpdateError.message}`);
    }

    const { error: jobOfferUpdateError } = await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (jobOfferUpdateError) {
      throw new Error(`DocuSeal submission was created, but the job offer status could not be updated: ${jobOfferUpdateError.message}`);
    }

    const { error: applicationUpdateError } = await admin
      .from("applications")
      .update({ status: "offer_sent", contract_offer_id: signedDocId, updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    if (applicationUpdateError) {
      throw new Error(`DocuSeal submission was created, but the application status could not be updated: ${applicationUpdateError.message}`);
    }
  } catch (err) {
    console.error("sendHydratedOffer: failed to finalize offer, rolling back", err);
    // Rollback both signed_documents and job_offers to avoid partial state
    await admin.from("signed_documents").delete().eq("id", signedDocId);
    await admin.from("job_offers").delete().eq("id", offer.id);
    throw new Error("Failed to finalize offer creation; no changes were applied. Please try again.");
  }

  console.log("[sendHydratedOffer] Offer created and sent successfully", {
    jobId,
    applicationId,
    offerId: offer.id,
    status: "DRAFT -> SENT",
    timestamp: new Date().toISOString(),
  });

  // Revalidate to update the UI on Review Board
  revalidatePath(`/hr/jobs/${jobId}`);
  revalidatePath(`/hr/jobs/${jobId}/applicants`);
  revalidatePath(`/job-offer/${applicationId}`);
  revalidatePath(`/job-offer/${offer.id}`);
  revalidatePath(`/offer-signing`);
  revalidatePath(`/applications/${applicationId}`);
  return {
    success: true,
    offerId: offer.id,
    signedDocId,
    docusealUrl,
  };
}

// Create a hydrated draft offer (DRAFT) but do not send to DocuSeal.
export async function createHydratedOfferDraft(jobIdOrApplicationId: string, maybeApplicationId?: string) {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const applicationId = maybeApplicationId ?? jobIdOrApplicationId;
    const { data: application, error: applicationError } = await admin
      .from("job_applications")
      .select("id, job_id, applicant_id, profiles!job_applications_applicant_id_fkey(first_name, last_name, email)")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      console.error("Application fetch error:", applicationError);
      return { success: false, error: `Failed to fetch application: ${applicationError?.message ?? "unknown error"}` };
    }

    const jobId = maybeApplicationId ? jobIdOrApplicationId : application.job_id;

    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select(
        "title, tenant_id, department_id, work_setup, salary_min, target_job_level, default_supervisor_id, shift_start, shift_end, work_days, schedule_type, rest_days_type, default_supervisor:employees!default_supervisor_id(id, job_title, job_level, profile:profiles!profile_id(first_name, last_name)), offer_letter_settings, docuseal_template_id, created_by"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("Job fetch error:", jobError);
      return { success: false, error: `Failed to fetch job blueprint: ${jobError?.message ?? "unknown error"}` };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Must be logged in to create an offer draft" };
    }

    let resolvedTenantId = (job as { tenant_id?: string | null }).tenant_id ?? null;
    if (!resolvedTenantId && job.created_by) {
      const { data: creatorProfile } = await admin
        .from("profiles")
        .select("tenant_id")
        .eq("id", job.created_by)
        .maybeSingle();
      resolvedTenantId = creatorProfile?.tenant_id ?? null;
    }

    const { data: creatorTenant } = resolvedTenantId
      ? await admin.from("tenants").select("name").eq("id", resolvedTenantId).maybeSingle()
      : { data: null };

    const tenantName = creatorTenant?.name?.trim() || null;

    const { data: existingOffers, error: existingOfferError } = await admin
      .from("job_offers")
      .select("id, version_id, created_by")
      .eq("application_id", applicationId)
      .order("version_id", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1);

    if (existingOfferError) {
      console.error("Offer draft lookup error:", existingOfferError);
      return { success: false, error: `Failed to look up existing offer draft: ${existingOfferError.message}` };
    }

    const existingOffer = existingOffers?.[0] ?? null;

    if (existingOffer) {
      const { error: archiveError } = await admin
        .from("job_offers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("application_id", applicationId)
        .eq("is_active", true);

      if (archiveError) {
        console.error("Offer archive error:", archiveError);
        return { success: false, error: `Failed to archive previous offer: ${archiveError.message}` };
      }
    }

    const settings = (job.offer_letter_settings ?? null) as Record<string, unknown> | null;
    const settingsWorkLocationId =
      typeof settings?.work_location_id === "string" ? settings.work_location_id : null;
    const resolvedWorkSetup = job.work_setup || "onsite";
    const resolvedWorkLocationId =
      (job as { work_location_id?: string | null }).work_location_id ?? settingsWorkLocationId;
    const jobWithSched = job as typeof job & {
      shift_start?: string | null;
      shift_end?: string | null;
      work_days?: string[] | null;
      schedule_type?: string | null;
      rest_days_type?: string | null;
    };
    const resolvedScheduleType = normalizeScheduleType(
      settings?.schedule_type ?? jobWithSched.schedule_type
    );
    const settingsShiftStart =
      (typeof jobWithSched.shift_start === "string" && jobWithSched.shift_start) ||
      (typeof settings?.shift_start === "string" && settings.shift_start) ||
      "08:00";
    const settingsShiftEnd =
      (typeof jobWithSched.shift_end === "string" && jobWithSched.shift_end) ||
      (typeof settings?.shift_end === "string" && settings.shift_end) ||
      "17:00";
    const rawSettingsWorkDays = normalizeShortWorkDays(
      Array.isArray(jobWithSched.work_days) && jobWithSched.work_days.length > 0
        ? jobWithSched.work_days
        : settings?.work_days
    );
    const workDaysPerWeek = clampWorkDaysPerWeek(
      settings?.work_days_per_week,
      rawSettingsWorkDays.length > 0 ? rawSettingsWorkDays.length : 5
    );
    const restDaysPolicy = normalizeRestDaysPolicy(
      settings?.rest_days_policy ?? jobWithSched.rest_days_type,
      resolvedScheduleType
    );
    const shiftRotationPattern = normalizeShiftRotationPattern(
      settings?.shift_rotation_pattern,
      resolvedScheduleType
    );
    const settingsWorkDays =
      rawSettingsWorkDays.length > 0
        ? rawSettingsWorkDays
        : resolvedScheduleType === "rotating"
          ? resolveDefaultWorkDaysForCount(workDaysPerWeek)
          : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const workScheduleSummary = buildWorkScheduleSummary({
      scheduleType: resolvedScheduleType,
      workDaysPerWeek,
      restDaysPolicy,
      shiftRotationPattern,
      shiftStart: settingsShiftStart,
      shiftEnd: settingsShiftEnd,
      workDays: settingsWorkDays,
    });

    const baseSalary = Number(job.offer_letter_settings?.phMonthlyBasicSalary || job.salary_min || 0) || 0;
    const compensationPackage = parseCompensationPackage(
      settings?.compensation_package,
      settings
    );
    const compTotals = computeCompensationTotals(compensationPackage, baseSalary);
    const monthlyAllowance =
      compTotals.monthlyAllowancesTotal > 0
        ? compTotals.monthlyAllowancesTotal
        : Math.max(
            0,
            Number(
              settings?.monthly_allowance ??
                settings?.phMonthlyAllowance ??
                0
            ) || 0
          );
    const attendanceIncentive =
      compTotals.attendanceIncentiveAmount > 0
        ? compTotals.attendanceIncentiveAmount
        : Math.max(
            0,
            Number(
              settings?.attendance_incentive ??
                settings?.phAttendanceIncentive ??
                0
            ) || 0
          );

    const resolvedStartDate =
      (typeof settings?.expected_start_date === "string" && settings.expected_start_date) ||
      job.offer_letter_settings?.phStartDate ||
      null;
    const resolvedDepartment =
      (typeof settings?.department === "string" && settings.department) ||
      job.offer_letter_settings?.phDepartment ||
      null;
    const resolvedProbationDays =
      Number(settings?.probation_days ?? job.offer_letter_settings?.phProbationPeriodDays ?? 180) || 180;
    const resolvedSupervisorName =
      (typeof settings?.supervisor_name === "string" && settings.supervisor_name) ||
      (typeof settings?.phSupervisorName === "string" && settings.phSupervisorName) ||
      null;
    const resolvedSupervisorTitle =
      (typeof settings?.supervisor_title === "string" && settings.supervisor_title) ||
      (typeof settings?.phSupervisorTitle === "string" && settings.phSupervisorTitle) ||
      null;

    const draftPayload = {
      application_id: applicationId,
      job_id: jobId,
      hr_id: user.id,
      status: "DRAFT",
      version_id: (existingOffer?.version_id ?? 0) + 1,
      parent_offer_id: existingOffer?.id ?? null,
      is_active: true,
      created_by: existingOffer?.created_by ?? user.id,
      salary: baseSalary,
      start_date: resolvedStartDate,
      work_setup: resolvedWorkSetup,
      work_mode: resolvedWorkSetup.toLowerCase(),
      work_location_id: resolvedWorkLocationId,
      shift_start: settingsShiftStart,
      shift_end: settingsShiftEnd,
      work_days: settingsWorkDays,
      department: resolvedDepartment,
      probation_days: resolvedProbationDays,
      financial_package: {
        offered_salary: baseSalary,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
      },
      job_metadata: {
        company_name: tenantName,
        start_date: resolvedStartDate,
        expected_start_date: resolvedStartDate,
        job_title: job.title,
        target_job_level: normalizeJobLevel((job as { target_job_level?: string | null }).target_job_level),
        supervisor_name: resolvedSupervisorName,
        supervisor_title: resolvedSupervisorTitle,
        reports_to_employee_id: (job as { default_supervisor_id?: string | null }).default_supervisor_id ?? null,
        reports_to_label:
          formatSupervisorDisplayLabel(
            Array.isArray((job as { default_supervisor?: unknown }).default_supervisor)
              ? ((job as { default_supervisor?: unknown[] }).default_supervisor?.[0] as Parameters<typeof formatSupervisorDisplayLabel>[0])
              : ((job as { default_supervisor?: unknown }).default_supervisor as Parameters<typeof formatSupervisorDisplayLabel>[0])
          ) ||
          (resolvedSupervisorName
            ? resolvedSupervisorTitle
              ? `${resolvedSupervisorName} — ${resolvedSupervisorTitle}`
              : resolvedSupervisorName
            : null),
        reports_to:
          formatSupervisorDisplayLabel(
            Array.isArray((job as { default_supervisor?: unknown }).default_supervisor)
              ? ((job as { default_supervisor?: unknown[] }).default_supervisor?.[0] as Parameters<typeof formatSupervisorDisplayLabel>[0])
              : ((job as { default_supervisor?: unknown }).default_supervisor as Parameters<typeof formatSupervisorDisplayLabel>[0])
          ) ||
          (resolvedSupervisorName
            ? resolvedSupervisorTitle
              ? `${resolvedSupervisorName} — ${resolvedSupervisorTitle}`
              : resolvedSupervisorName
            : null),
        // include any selected benefits if present in job.offer_letter_settings
        benefits:
          compTotals.selectedBenefitLabels.length > 0
            ? compTotals.selectedBenefitLabels
            : job.offer_letter_settings?.selectedBenefits ?? null,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
        service_incentive_leave:
          Number(settings?.service_incentive_leave ?? settings?.phServiceIncentiveLeave ?? 5) || 5,
        vacation_leave_days:
          Number(settings?.vacation_leave_days ?? settings?.phVacationLeaveDays ?? 0) || 0,
        sick_leave_days:
          Number(settings?.sick_leave_days ?? settings?.phSickLeaveDays ?? 0) || 0,
        hmo_provider:
          (typeof settings?.hmo_provider === "string" && settings.hmo_provider.trim()) ||
          (typeof settings?.phHmoProvider === "string" && settings.phHmoProvider.trim()) ||
          null,
        schedule_type: resolvedScheduleType,
        work_days_per_week: workDaysPerWeek,
        rest_days_policy: restDaysPolicy,
        shift_rotation_pattern: shiftRotationPattern,
        shift_start: settingsShiftStart,
        shift_end: settingsShiftEnd,
        work_days: settingsWorkDays,
        work_schedule_summary: workScheduleSummary,
      },
    };

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .insert(draftPayload)
      .select()
      .single();

    if (offerError || !offer) {
      console.error("Offer draft creation error:", offerError);
      return { success: false, error: `Failed to generate offer draft: ${offerError?.message ?? "unknown error"}` };
    }

    return { success: true, offer };
  } catch (error) {
    console.error("createHydratedOfferDraft error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create offer draft",
    };
  }
}

export async function getOfferHierarchyContext(jobId: string): Promise<{
  targetJobLevel: ReturnType<typeof normalizeJobLevel>;
  targetJobLevelLabel: string;
  defaultSupervisorId: string | null;
  defaultSupervisorLabel: string | null;
  departmentId: string | null;
  tenantId: string | null;
  supervisorCandidates: SupervisorCandidate[];
  expectedStartDate: string | null;
  supervisorName: string | null;
  supervisorTitle: string | null;
  department: string | null;
  probationDays: number | null;
  scheduleType: ScheduleType;
  workDaysPerWeek: number;
  restDaysPolicy: RestDaysPolicy;
  shiftRotationPattern: ShiftRotationPattern;
  shiftStart: string;
  shiftEnd: string;
  workDays: string[];
  workScheduleSummary: string;
  hrRole: HrSubRole;
  canSendStandardOffer: boolean;
  canApproveAndSendOffers: boolean;
  canSubmitRecommendation: boolean;
}> {
  const hrSession = await getHrSessionContext().catch(() => null);
  const admin = getAdminClient();
  const { data: job } = await admin
    .from("job_postings")
    .select(
      "id, tenant_id, department_id, target_job_level, default_supervisor_id, shift_start, shift_end, work_days, schedule_type, rest_days_type, default_supervisor:employees!default_supervisor_id(id, job_title, job_level, profile:profiles!profile_id(first_name, last_name)), offer_letter_settings"
    )
    .eq("id", jobId)
    .maybeSingle();

  const tenantId = (job as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  const { supervisorCandidates } = await fetchDepartmentsAndSupervisors(tenantId);
  const targetJobLevel = normalizeJobLevel(
    (job as { target_job_level?: string | null } | null)?.target_job_level
  );
  const rawSupervisor = (job as { default_supervisor?: unknown } | null)?.default_supervisor;
  const supervisor = Array.isArray(rawSupervisor) ? rawSupervisor[0] : rawSupervisor;
  const defaultSupervisorLabel =
    formatSupervisorDisplayLabel(
      supervisor as Parameters<typeof formatSupervisorDisplayLabel>[0]
    ) || null;

  const settings = ((job as { offer_letter_settings?: Record<string, unknown> | null } | null)
    ?.offer_letter_settings ?? null) as Record<string, unknown> | null;
  const expectedStartDate =
    (typeof settings?.expected_start_date === "string" && settings.expected_start_date) ||
    (typeof settings?.phStartDate === "string" && settings.phStartDate) ||
    null;
  const supervisorName =
    (typeof settings?.supervisor_name === "string" && settings.supervisor_name) ||
    (typeof settings?.phSupervisorName === "string" && settings.phSupervisorName) ||
    null;
  const supervisorTitle =
    (typeof settings?.supervisor_title === "string" && settings.supervisor_title) ||
    (typeof settings?.phSupervisorTitle === "string" && settings.phSupervisorTitle) ||
    null;
  const department =
    (typeof settings?.department === "string" && settings.department) ||
    (typeof settings?.phDepartment === "string" && settings.phDepartment) ||
    null;
  const rawProbation = settings?.probation_days ?? settings?.phProbationPeriodDays;
  const probationDays =
    rawProbation !== null && rawProbation !== undefined && Number.isFinite(Number(rawProbation))
      ? Number(rawProbation)
      : null;

  const jobSched = job as {
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    schedule_type?: string | null;
    rest_days_type?: string | null;
  } | null;
  const scheduleType = normalizeScheduleType(settings?.schedule_type ?? jobSched?.schedule_type);
  const shiftStart =
    (typeof jobSched?.shift_start === "string" && jobSched.shift_start) ||
    (typeof settings?.shift_start === "string" && settings.shift_start) ||
    "08:00";
  const shiftEnd =
    (typeof jobSched?.shift_end === "string" && jobSched.shift_end) ||
    (typeof settings?.shift_end === "string" && settings.shift_end) ||
    "17:00";
  const rawWorkDays = normalizeShortWorkDays(
    Array.isArray(jobSched?.work_days) && jobSched.work_days.length > 0
      ? jobSched.work_days
      : settings?.work_days
  );
  const workDaysPerWeek = clampWorkDaysPerWeek(
    settings?.work_days_per_week,
    rawWorkDays.length > 0 ? rawWorkDays.length : 5
  );
  const restDaysPolicy = normalizeRestDaysPolicy(
    settings?.rest_days_policy ?? jobSched?.rest_days_type,
    scheduleType
  );
  const shiftRotationPattern = normalizeShiftRotationPattern(
    settings?.shift_rotation_pattern,
    scheduleType
  );
  const workDays =
    rawWorkDays.length > 0
      ? rawWorkDays
      : scheduleType === "rotating"
        ? resolveDefaultWorkDaysForCount(workDaysPerWeek)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const workScheduleSummary = buildWorkScheduleSummary({
    scheduleType,
    workDaysPerWeek,
    restDaysPolicy,
    shiftRotationPattern,
    shiftStart,
    shiftEnd,
    workDays,
  });

  const hrRole: HrSubRole = hrSession?.hr_role ?? "hr_admin";
  const canSendStandardOffer = hrSession
    ? canHr(hrSession.hr_role, "offers:send_standard", hrSession.is_tenant_owner)
    : true;
  const canApproveAndSendOffers = hrSession
    ? canHr(hrSession.hr_role, "offers:approve_and_send", hrSession.is_tenant_owner)
    : true;
  const canSubmitRecommendation = hrSession
    ? canHr(hrSession.hr_role, "offers:draft", hrSession.is_tenant_owner)
    : false;

  return {
    targetJobLevel,
    targetJobLevelLabel: JOB_LEVEL_LABELS[targetJobLevel],
    defaultSupervisorId:
      (job as { default_supervisor_id?: string | null } | null)?.default_supervisor_id ?? null,
    defaultSupervisorLabel,
    departmentId: (job as { department_id?: string | null } | null)?.department_id ?? null,
    tenantId,
    supervisorCandidates,
    expectedStartDate,
    supervisorName,
    supervisorTitle,
    department,
    probationDays,
    scheduleType,
    workDaysPerWeek,
    restDaysPolicy,
    shiftRotationPattern,
    shiftStart,
    shiftEnd,
    workDays,
    workScheduleSummary,
    hrRole,
    canSendStandardOffer,
    canApproveAndSendOffers,
    canSubmitRecommendation,
  };
}

// Update fields on an existing draft offer. Accepts a partial updates object.
export async function updateOfferDraft(offerId: string, updates: Record<string, unknown>) {
  const hrSession = await getHrSessionContext().catch(() => null);
  if (hrSession && !canHr(hrSession.hr_role, "offers:approve_and_send", hrSession.is_tenant_owner)) {
    return {
      success: false,
      error: "Forbidden: Only HR Admin or HR Generalist can edit binding offer terms.",
    };
  }

  const admin = getAdminClient();

  const { data, error } = await admin
    .from("job_offers")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .select()
    .single();

  if (error) {
    console.error("updateOfferDraft error:", error);
    return { success: false, error: error.message };
  }

  return { success: true, offer: data };
}

// Send an existing draft offer via DocuSeal and finalize records.
export async function sendDraftOffer(jobId: string, applicationId: string, offerId: string) {
  try {
    const hrSession = await getHrSessionContext().catch(() => null);
    if (hrSession && !canHr(hrSession.hr_role, "offers:send_standard", hrSession.is_tenant_owner)) {
      return {
        success: false,
        error: "Forbidden: You do not have permission to send job offers.",
      };
    }

    const canOverrideTerms = hrSession
      ? canHr(hrSession.hr_role, "offers:approve_and_send", hrSession.is_tenant_owner)
      : true;

    const admin = getAdminClient();
    const supabase = await createClient();

    const [{ data: offerSnapshot }, { data: jobSnapshot }] =
      await Promise.all([
        admin
          .from("job_offers")
          .select("id, status, salary, job_metadata")
          .eq("id", offerId)
          .maybeSingle(),
        admin
          .from("job_postings")
          .select("id, title, tenant_id, salary_min, offer_letter_settings, docuseal_template_id, created_by")
          .eq("id", jobId)
          .maybeSingle(),
      ]);

    if (!canOverrideTerms) {
      const offerStatus = String(offerSnapshot?.status ?? "").trim().toUpperCase();
      const offerMeta = (offerSnapshot?.job_metadata ?? {}) as Record<string, unknown>;
      const pendingRec = offerMeta.recruiter_recommendation as { status?: string } | undefined;
      if (
        offerStatus === "NEGOTIATION_PENDING" ||
        offerStatus === "NEGOTIATING" ||
        pendingRec?.status === "pending"
      ) {
        return {
          success: false,
          error:
            "Forbidden: Negotiation approvals and custom offer revisions require HR Admin or HR Generalist approval.",
        };
      }

      const jobOfferSettings = (jobSnapshot?.offer_letter_settings ?? null) as Record<string, unknown> | null;
      const standardSalary =
        Number(jobOfferSettings?.phMonthlyBasicSalary || jobSnapshot?.salary_min || 0) || 0;
      const currentOfferSalary = Number(offerSnapshot?.salary ?? 0) || 0;
      if (standardSalary > 0 && currentOfferSalary !== standardSalary) {
        return {
          success: false,
          error:
            "Forbidden: Custom compensation overrides require HR Admin or HR Generalist approval.",
        };
      }
    }

    // Dispatch DocuSeal submission
    const sendResult = await sendOfferWithDocuSeal(jobId, applicationId, offerId);
    if (!sendResult.success) {
      console.error(`DocuSeal integration failed: ${sendResult.error}`);
      return { success: false, error: `Failed to send contract via DocuSeal: ${sendResult.error}` };
    }

    // Create signed_documents placeholder
    let signedDocId: string;
    try {
      const job = jobSnapshot ?? (
        await supabase
          .from("job_postings")
          .select("docuseal_template_id, created_by")
          .eq("id", jobId)
          .single()
      ).data;

      const result = await createSignedDocumentPlaceholderWithTemplateFallback(admin, {
        applicationId,
        jobPostingId: jobId,
        docusealTemplateId: String(job?.docuseal_template_id ?? "").trim(),
        createdBy: job?.created_by ?? "",
        signingMethod: "digital",
        status: "sent",
        metadata: { job_offer_id: offerId },
      });

      signedDocId = result.signedDocumentId;
    } catch (signedDocError) {
      return {
        success: false,
        error: `Failed to create signed_documents placeholder: ${signedDocError instanceof Error ? signedDocError.message : "unknown error"}`,
      };
    }

    const docusealUrl = sendResult.url ?? null;

    const { error: signedDocumentUpdateError } = await admin
      .from("signed_documents")
      .update({ docuseal_submission_url: docusealUrl, metadata: { job_offer_id: offerId }, updated_at: new Date().toISOString() })
      .eq("id", signedDocId);

    if (signedDocumentUpdateError) {
      throw new Error(signedDocumentUpdateError.message);
    }

    const { error: jobOfferUpdateError } = await admin
      .from("job_offers")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (jobOfferUpdateError) {
      throw new Error(jobOfferUpdateError.message);
    }

    const { error: applicationUpdateError } = await admin
      .from("job_applications")
      .update({ status: "offer_sent", contract_offer_id: signedDocId, updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    if (applicationUpdateError) {
      throw new Error(applicationUpdateError.message);
    }

    if (!sendResult.handoverNotified) {
      const fallbackTenantId = jobSnapshot?.tenant_id ?? hrSession?.tenant_id ?? null;
      await notifyTenantOfferDecisionMakers({
        tenantId: fallbackTenantId,
        excludeUserId: hrSession?.id ?? null,
        type: "offer_letter",
        title: `Offer Handover: Standard Offer Sent (${jobSnapshot?.title || "Job Role"})`,
        body: `A standard job offer was sent for ${jobSnapshot?.title || "the role"}. Review the outgoing contract for oversight.`,
        actionUrl: `/hr/offers/${offerId}`,
        senderId: hrSession?.id ?? null,
        actionName: "sendDraftOffer",
      });
    }

    revalidatePath(`/hr/applicants`);
    revalidatePath(`/hr/jobs/${jobId}/applicants`);
    revalidatePath(`/hr/jobs/${jobId}/applicants/${applicationId}`);
    revalidatePath(`/hr/offers/${offerId}`);
    revalidatePath(`/hr/offers/${applicationId}`);
    revalidatePath(`/job-offer/${applicationId}`);
    revalidatePath(`/applicant/applications/${applicationId}`);
    revalidatePath(`/applicant/offer/${applicationId}`);
    revalidatePath(`/applicant/offer/${applicationId}/sign`);

    return { success: true, offerId, signedDocId, docusealUrl };
  } catch (err) {
    console.error("sendDraftOffer: failed to finalize offer", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to finalize offer creation; no changes were applied. Please try again.",
    };
  }
}

export async function getOfferSummary(
  applicationId: string
): Promise<{ exists: boolean; status: string | null; applicationStatus: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["hr_manager", "admin", "hr"].includes(String(profile.role ?? ""))
  ) {
    throw new Error("Forbidden: HR role required");
  }

  const admin = getAdminClient();
  const { data: applicationRow, error: applicationError } = await admin
    .from("job_applications")
    .select("id, status, job_id, job_postings!job_applications_job_id_fkey(tenant_id)")
    .eq("id", applicationId)
    .single();

  if (applicationError || !applicationRow) {
    throw new Error(applicationError?.message ?? "Application not found");
  }

  const jobPosting = Array.isArray(applicationRow.job_postings)
    ? applicationRow.job_postings[0]
    : applicationRow.job_postings;

  if (
    profile.tenant_id &&
    jobPosting?.tenant_id &&
    profile.tenant_id !== jobPosting.tenant_id
  ) {
    throw new Error("Forbidden: tenant mismatch");
  }

  const { data: offerRow, error: offerError } = await admin
    .from("job_offers")
    .select("id, status")
    .eq("application_id", applicationId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (offerError) {
    throw new Error(offerError.message);
  }

  return {
    exists: Boolean(offerRow),
    status: offerRow?.status ?? null,
    applicationStatus: (applicationRow as { status?: string | null }).status ?? null,
  };
}

export interface RecruiterOfferRecommendation {
  recommended_base_salary: number;
  justification: string;
  recommended_by_profile_id: string;
  recommended_by_name: string;
  recommended_at: string;
  status: "pending" | "accepted" | "declined";
  decision_note?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
}

export async function submitRecruiterOfferRecommendationAction(input: {
  offerId: string;
  recommendedBaseSalary: number;
  justification: string;
}): Promise<{ success: boolean; error?: string; offer?: Record<string, unknown> }> {
  const ctx = await requireHrPermission("offers:draft");
  const { offerId, recommendedBaseSalary, justification } = input;

  if (!offerId) {
    return { success: false, error: "Offer ID is required." };
  }
  if (!Number.isFinite(recommendedBaseSalary) || recommendedBaseSalary <= 0) {
    return { success: false, error: "Recommended basic salary must be greater than 0." };
  }
  if (!justification.trim()) {
    return { success: false, error: "Justification note is required." };
  }

  const admin = getAdminClient();
  const [{ data: offerRow, error: offerErr }, { data: callerProfile }] = await Promise.all([
    admin
      .from("job_offers")
      .select("id, application_id, job_id, job_metadata")
      .eq("id", offerId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("first_name, last_name, tenant_id")
      .eq("id", ctx.id)
      .maybeSingle(),
  ]);

  if (offerErr || !offerRow) {
    return { success: false, error: offerErr?.message ?? "Job offer not found." };
  }

  const callerName =
    [callerProfile?.first_name, callerProfile?.last_name].filter(Boolean).join(" ").trim() ||
    "Recruiter";

  const existingMeta = (offerRow.job_metadata ?? {}) as Record<string, unknown>;
  const recommendation: RecruiterOfferRecommendation = {
    recommended_base_salary: recommendedBaseSalary,
    justification: justification.trim(),
    recommended_by_profile_id: ctx.id,
    recommended_by_name: callerName,
    recommended_at: new Date().toISOString(),
    status: "pending",
  };

  const { data: updatedOffer, error: updateErr } = await admin
    .from("job_offers")
    .update({
      job_metadata: {
        ...existingMeta,
        recruiter_recommendation: recommendation,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .select()
    .single();

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  const [{ data: jobAppRow }, { data: jobRow }] = await Promise.all([
    offerRow.application_id
      ? admin
          .from("job_applications")
          .select("id, profiles!job_applications_applicant_id_fkey(first_name, last_name)")
          .eq("id", offerRow.application_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    offerRow.job_id
      ? admin
          .from("job_postings")
          .select("id, tenant_id, created_by")
          .eq("id", offerRow.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rawCand = jobAppRow?.profiles;
  const candProfile = Array.isArray(rawCand) ? rawCand[0] : rawCand;
  const candidateName =
    [
      (candProfile as { first_name?: string | null } | null)?.first_name,
      (candProfile as { last_name?: string | null } | null)?.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Candidate";

  const tenantId = jobRow?.tenant_id ?? ctx.tenant_id ?? callerProfile?.tenant_id ?? null;
  await notifyTenantOfferDecisionMakers({
    tenantId,
    excludeUserId: ctx.id,
    type: "offer_letter",
    title: `Action Required: Offer Negotiation / Salary Review for ${candidateName}`,
    body: `${callerName} recommended ₱${recommendedBaseSalary.toLocaleString("en-PH")} basic salary. Review and approve or decline in Offer Draft.`,
    actionUrl: `/hr/offers/${offerId}`,
    senderId: ctx.id,
    actionName: "submitRecruiterOfferRecommendationAction",
  });

  revalidatePath("/hr/offers");
  revalidatePath(`/hr/offers/${offerId}`);
  revalidatePath("/hr/jobs");

  return { success: true, offer: updatedOffer as Record<string, unknown> };
}

export async function declineOfferNegotiationAction(input: {
  offerId: string;
  decisionNote?: string;
}): Promise<{ success: boolean; error?: string; offer?: Record<string, unknown> }> {
  const ctx = await requireHrPermission("offers:approve_and_send");
  const { offerId, decisionNote } = input;

  if (!offerId) {
    return { success: false, error: "Offer ID is required." };
  }

  const admin = getAdminClient();
  const [{ data: offerRow, error: offerErr }, { data: callerProfile }] = await Promise.all([
    admin
      .from("job_offers")
      .select("id, application_id, job_id, status, job_metadata")
      .eq("id", offerId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", ctx.id)
      .maybeSingle(),
  ]);

  if (offerErr || !offerRow) {
    return { success: false, error: offerErr?.message ?? "Job offer not found." };
  }

  const decidedByName =
    [callerProfile?.first_name, callerProfile?.last_name].filter(Boolean).join(" ").trim() ||
    "HR Approver";
  const decidedAt = new Date().toISOString();
  const trimmedNote = decisionNote?.trim() || "Original standing offer maintained.";

  const existingMeta = (offerRow.job_metadata ?? {}) as Record<string, unknown>;
  const existingRec = (existingMeta.recruiter_recommendation ?? null) as
    | RecruiterOfferRecommendation
    | null;

  const updatedMeta: Record<string, unknown> = {
    ...existingMeta,
    negotiation_decision: {
      status: "declined",
      decision_note: trimmedNote,
      decided_by_name: decidedByName,
      decided_at: decidedAt,
    },
    ...(existingRec
      ? {
          recruiter_recommendation: {
            ...existingRec,
            status: "declined",
            decision_note: trimmedNote,
            decided_by_name: decidedByName,
            decided_at: decidedAt,
          },
        }
      : {}),
  };

  const normalizedOfferStatus = String(offerRow.status ?? "").trim().toUpperCase();
  const nextOfferStatus =
    normalizedOfferStatus === "NEGOTIATION_PENDING" || normalizedOfferStatus === "NEGOTIATING"
      ? "SENT"
      : offerRow.status;

  const { data: updatedOffer, error: updateErr } = await admin
    .from("job_offers")
    .update({
      status: nextOfferStatus,
      job_metadata: updatedMeta,
      updated_at: decidedAt,
    })
    .eq("id", offerId)
    .select()
    .single();

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  const [{ data: jobApp }, { data: jobPosting }] = await Promise.all([
    offerRow.application_id
      ? admin
          .from("job_applications")
          .select("id, applicant_id, status")
          .eq("id", offerRow.application_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    offerRow.job_id
      ? admin
          .from("job_postings")
          .select("id, title, created_by")
          .eq("id", offerRow.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (jobApp?.id && String(jobApp.status ?? "").toLowerCase() === "negotiating") {
    await admin
      .from("job_applications")
      .update({ status: "offer_sent", updated_at: decidedAt })
      .eq("id", jobApp.id);
  }

  const jobTitle = jobPosting?.title || "the role";
  const recruiterIds = Array.from(
    new Set(
      [existingRec?.recommended_by_profile_id, jobPosting?.created_by].filter(
        (id): id is string => Boolean(id && id !== ctx.id)
      )
    )
  );

  await Promise.all([
    ...recruiterIds.map((recruiterId) =>
      sendNotification({
        recipientId: recruiterId,
        senderId: ctx.id,
        type: "offer_letter",
        title: "Offer Negotiation Declined — Standing Offer Maintained",
        body: `HR maintained the standing offer for ${jobTitle}. Note: ${trimmedNote}`,
        actionUrl: `/hr/offers/${offerId}`,
        actionName: "declineOfferNegotiationAction",
      })
    ),
    ...(jobApp?.applicant_id
      ? [
          sendNotification({
            recipientId: jobApp.applicant_id,
            senderId: ctx.id,
            type: "offer_letter",
            title: "Standing Job Offer Maintained",
            body: `Your original offer for ${jobTitle} remains open for signing. Note: ${trimmedNote}`,
            actionUrl: "/applicant/applications",
            actionName: "declineOfferNegotiationAction",
          }),
        ]
      : []),
  ]);

  revalidatePath("/hr/offers");
  revalidatePath(`/hr/offers/${offerId}`);
  revalidatePath("/hr/jobs");
  revalidatePath("/applicant/applications");

  return { success: true, offer: updatedOffer as Record<string, unknown> };
}

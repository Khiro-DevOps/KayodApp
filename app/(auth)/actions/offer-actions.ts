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
    .select("title, work_setup, work_location_id, shift_start, shift_end, work_days, salary_min, offer_letter_settings, docuseal_template_id, created_by")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("Job fetch error:", jobError);
    throw new Error("Failed to fetch job blueprint");
  }

  const { data: creatorProfile, error: creatorProfileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", job.created_by)
    .single();

  if (creatorProfileError) {
    console.warn("[sendHydratedOffer] Failed to resolve tenant id:", creatorProfileError);
  }

  const { data: creatorTenant } = creatorProfile?.tenant_id
    ? await supabase.from("tenants").select("name").eq("id", creatorProfile.tenant_id).single()
    : { data: null };

  const tenantName = creatorTenant?.name ?? null;

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
      start_date: job.offer_letter_settings?.phStartDate || null,
      work_mode: job.work_setup || 'onsite',
      work_location_id: job.work_location_id || null,
      shift_start: job.shift_start || null,
      shift_end: job.shift_end || null,
      work_days: job.work_days || null,
      department: job.offer_letter_settings?.phDepartment || null,
      probation_days: job.offer_letter_settings?.phProbationPeriodDays || 180,
      financial_package: {
        offered_salary: baseSalary,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
      },
      job_metadata: {
        company_name: tenantName,
        start_date: job.offer_letter_settings?.phStartDate || null,
        job_title: job.title,
        benefits:
          compTotals.selectedBenefitLabels.length > 0
            ? compTotals.selectedBenefitLabels
            : job.offer_letter_settings?.selectedBenefits ?? null,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
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
      .select("title, work_setup, work_location_id, salary_min, offer_letter_settings, docuseal_template_id, created_by")
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

    const { data: creatorProfile, error: creatorProfileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", job.created_by)
      .single();

    if (creatorProfileError) {
      console.warn("[createHydratedOfferDraft] Failed to resolve tenant id:", creatorProfileError);
    }

    const { data: creatorTenant } = creatorProfile?.tenant_id
      ? await supabase.from("tenants").select("name").eq("id", creatorProfile.tenant_id).single()
      : { data: null };

    const tenantName = creatorTenant?.name ?? null;

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
    const settingsShiftStart =
      typeof settings?.shift_start === "string" && settings.shift_start
        ? settings.shift_start
        : "08:00:00";
    const settingsShiftEnd =
      typeof settings?.shift_end === "string" && settings.shift_end
        ? settings.shift_end
        : "17:00:00";
    const settingsWorkDays = Array.isArray(settings?.work_days)
      ? (settings.work_days as string[])
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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
      start_date: job.offer_letter_settings?.phStartDate || null,
      work_setup: resolvedWorkSetup,
      work_mode: resolvedWorkSetup.toLowerCase(),
      work_location_id: resolvedWorkLocationId,
      shift_start: settingsShiftStart,
      shift_end: settingsShiftEnd,
      work_days: settingsWorkDays,
      department: job.offer_letter_settings?.phDepartment || null,
      probation_days: job.offer_letter_settings?.phProbationPeriodDays || 180,
      financial_package: {
        offered_salary: baseSalary,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
      },
      job_metadata: {
        company_name: tenantName,
        start_date: job.offer_letter_settings?.phStartDate || null,
        job_title: job.title,
        // include any selected benefits if present in job.offer_letter_settings
        benefits:
          compTotals.selectedBenefitLabels.length > 0
            ? compTotals.selectedBenefitLabels
            : job.offer_letter_settings?.selectedBenefits ?? null,
        monthly_allowance: monthlyAllowance,
        attendance_incentive: attendanceIncentive,
        performance_bonus: compTotals.performanceBonusAmount,
        compensation_package: compensationPackage,
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

// Update fields on an existing draft offer. Accepts a partial updates object.
export async function updateOfferDraft(offerId: string, updates: Record<string, unknown>) {
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
    const admin = getAdminClient();
    const supabase = await createClient();

    // Dispatch DocuSeal submission
    const sendResult = await sendOfferWithDocuSeal(jobId, applicationId, offerId);
    if (!sendResult.success) {
      console.error(`DocuSeal integration failed: ${sendResult.error}`);
      return { success: false, error: `Failed to send contract via DocuSeal: ${sendResult.error}` };
    }

    // Create signed_documents placeholder
    let signedDocId: string;
    try {
      const { data: job } = await supabase
        .from("job_postings")
        .select("docuseal_template_id, created_by")
        .eq("id", jobId)
        .single();

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

    revalidatePath(`/hr/jobs/${jobId}/applicants`);
    revalidatePath(`/hr/jobs/${jobId}/applicants/${applicationId}`);
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

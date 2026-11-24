"use server";

import { revalidatePath } from "next/cache";
import { resolveCompanyLogoUrlForUser } from "@/lib/company-logos";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildOfferPrefillFields, createDocusealSubmission } from "@/lib/docuseal";
import { ensureOfferTemplate } from "@/lib/docuseal-actions";
import { formatSupervisorDisplayLabel } from "@/lib/workforce-hierarchy";
import { canHr } from "@/lib/rbac/permissions";
import { notifyTenantOfferDecisionMakers } from "@/lib/notifications";

type SendOfferWithDocuSealResult =
  | {
      success: true;
      url: string;
      handoverNotified?: boolean;
    }
  | {
      success: false;
      error: string;
    };

export async function sendOfferWithDocuSeal(
  jobId: string,
  applicationId: string,
  offerId: string
): Promise<SendOfferWithDocuSealResult> {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Must be logged in to send an offer");
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, hr_role, is_tenant_owner, tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (
      !callerProfile ||
      !["hr", "hr_manager", "admin"].includes(String(callerProfile.role)) ||
      !canHr(callerProfile.hr_role, "offers:send_standard", callerProfile.is_tenant_owner)
    ) {
      throw new Error("Unauthorized");
    }

    const { data: job, error: jobError } = await admin
      .from("job_postings")
      .select(
        "id, tenant_id, title, location, work_location_id, currency, employment_type, docuseal_template_id, created_by, target_job_level, default_supervisor_id, shift_start, shift_end, work_days, schedule_type, rest_days_type, default_supervisor:employees!default_supervisor_id(id, job_title, job_level, profile:profiles!profile_id(first_name, last_name)), offer_letter_settings"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? "Job posting not found");
    }

    const { data: application, error: applicationError } = await admin
      .from("job_applications")
      .select("id, applicant_id, job_id, profiles!job_applications_applicant_id_fkey (first_name, last_name, email)")
      .eq("id", applicationId)
      .maybeSingle();

    if (applicationError || !application) {
      throw new Error(applicationError?.message ?? "Application not found");
    }

    const rawProfile = Array.isArray(application.profiles) ? application.profiles[0] : application.profiles;
    const candidate = (rawProfile as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    } | null) ?? null;

    const candidateName = [candidate?.first_name, candidate?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Candidate";

    const candidateEmail = candidate?.email?.trim();
    if (!candidateEmail) {
      throw new Error("Candidate email is required to send a DocuSeal offer");
    }

    const { data: offerRow, error: offerError } = await admin
      .from("job_offers")
      .select("id, salary, start_date, work_setup, work_mode, work_location_id, department, probation_days, shift_start, shift_end, work_days, financial_package, job_metadata, metadata")
      .eq("id", offerId)
      .single();

    if (offerError || !offerRow) {
      throw new Error(offerError?.message ?? "Job offer not found");
    }

    const { data: creatorProfile } = job.created_by
      ? await admin
          .from("profiles")
          .select("tenant_id")
          .eq("id", job.created_by)
          .maybeSingle()
      : { data: null };

    const resolvedTenantId =
      (job as { tenant_id?: string | null }).tenant_id ||
      creatorProfile?.tenant_id ||
      callerProfile?.tenant_id ||
      null;

    const offerSettingsForLoc = (job.offer_letter_settings ?? null) as Record<string, unknown> | null;
    const rawJobLoc = String(job.location ?? "").trim();
    const isUuidJobLoc = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawJobLoc);
    const resolvedBranchId =
      offerRow.work_location_id ||
      (job as { work_location_id?: string | null }).work_location_id ||
      (typeof offerSettingsForLoc?.work_location_id === "string"
        ? offerSettingsForLoc.work_location_id
        : null) ||
      (isUuidJobLoc ? rawJobLoc : null);

    let branchRow: { id: string; name: string; address?: string | null } | null = null;
    if (resolvedBranchId) {
      const { data } = await admin
        .from("office_branches")
        .select("id, name, address")
        .eq("id", resolvedBranchId)
        .maybeSingle();
      branchRow = data;
    }
    if (!branchRow && (!rawJobLoc || isUuidJobLoc) && resolvedTenantId) {
      const workSetupNorm = String(offerRow.work_setup ?? offerRow.work_mode ?? "").toLowerCase();
      if (workSetupNorm !== "remote" && workSetupNorm !== "wfh") {
        const { data: primaryBranch } = await admin
          .from("office_branches")
          .select("id, name, address")
          .eq("tenant_id", resolvedTenantId)
          .order("is_primary", { ascending: false })
          .limit(1)
          .maybeSingle();
        branchRow = primaryBranch;
      }
    }

    const { data: tenantRow } = resolvedTenantId
      ? await admin
          .from("tenants")
          .select("name")
          .eq("id", resolvedTenantId)
          .maybeSingle()
      : { data: null };

    const resolvedCompanyName = tenantRow?.name?.trim() || "";
    if (!resolvedCompanyName) {
      throw new Error("Cannot send offer via DocuSeal: company name (tenants.name) is missing.");
    }

    const offerSettings = (job.offer_letter_settings ?? null) as Record<string, unknown> | null;
    const rawDefaultSupervisor = (job as { default_supervisor?: unknown }).default_supervisor;
    const defaultSupervisor = Array.isArray(rawDefaultSupervisor)
      ? rawDefaultSupervisor[0]
      : rawDefaultSupervisor;
    const defaultReportsToLabel = formatSupervisorDisplayLabel(
      defaultSupervisor as Parameters<typeof formatSupervisorDisplayLabel>[0]
    );
    const settingsExpectedStartDate =
      (typeof offerSettings?.expected_start_date === "string" && offerSettings.expected_start_date.trim()) ||
      (typeof offerSettings?.phStartDate === "string" && offerSettings.phStartDate.trim()) ||
      null;
    const settingsSupervisorName =
      (typeof offerSettings?.supervisor_name === "string" && offerSettings.supervisor_name.trim()) ||
      (typeof offerSettings?.phSupervisorName === "string" && offerSettings.phSupervisorName.trim()) ||
      null;
    const settingsSupervisorTitle =
      (typeof offerSettings?.supervisor_title === "string" && offerSettings.supervisor_title.trim()) ||
      (typeof offerSettings?.phSupervisorTitle === "string" && offerSettings.phSupervisorTitle.trim()) ||
      null;
    const jobWithSched = job as typeof job & {
      shift_start?: string | null;
      shift_end?: string | null;
      work_days?: string[] | null;
      schedule_type?: string | null;
      rest_days_type?: string | null;
    };
    const templateId = await ensureOfferTemplate(jobId);
    const prefillFields = buildOfferPrefillFields(
      offerRow,
      {
        title: job.title,
        currency: job.currency,
        location: job.location,
        employment_type: (job as { employment_type?: string | null }).employment_type ?? null,
        company_name: resolvedCompanyName,
        shift_start:
          jobWithSched.shift_start ??
          (typeof offerSettings?.shift_start === "string" ? offerSettings.shift_start : null),
        shift_end:
          jobWithSched.shift_end ??
          (typeof offerSettings?.shift_end === "string" ? offerSettings.shift_end : null),
        work_days:
          Array.isArray(jobWithSched.work_days) && jobWithSched.work_days.length > 0
            ? jobWithSched.work_days
            : Array.isArray(offerSettings?.work_days)
              ? (offerSettings.work_days as string[])
              : null,
        schedule_type:
          (typeof offerSettings?.schedule_type === "string" ? offerSettings.schedule_type : null) ??
          jobWithSched.schedule_type ??
          null,
        rest_days_type: jobWithSched.rest_days_type ?? null,
        rest_days_policy:
          typeof offerSettings?.rest_days_policy === "string"
            ? offerSettings.rest_days_policy
            : null,
        shift_rotation_pattern:
          typeof offerSettings?.shift_rotation_pattern === "string"
            ? offerSettings.shift_rotation_pattern
            : null,
        work_days_per_week:
          typeof offerSettings?.work_days_per_week === "number"
            ? offerSettings.work_days_per_week
            : null,
        reports_to: defaultReportsToLabel || null,
        supervisor_name: settingsSupervisorName,
        supervisor_title: settingsSupervisorTitle,
        expected_start_date: settingsExpectedStartDate,
        target_job_level: (job as { target_job_level?: string | null }).target_job_level ?? null,
        pay_frequency:
          typeof offerSettings?.phPayFrequency === "string"
            ? offerSettings.phPayFrequency
            : null,
        hmo_provider:
          typeof offerSettings?.hmo_provider === "string"
            ? offerSettings.hmo_provider
            : typeof offerSettings?.phHmoProvider === "string"
              ? offerSettings.phHmoProvider
              : null,
        service_incentive_leave:
          Number(offerSettings?.service_incentive_leave ?? offerSettings?.phServiceIncentiveLeave ?? 0) || null,
        vacation_leave_days:
          Number(offerSettings?.vacation_leave_days ?? offerSettings?.phVacationLeaveDays ?? 0) || null,
        sick_leave_days:
          Number(offerSettings?.sick_leave_days ?? offerSettings?.phSickLeaveDays ?? 0) || null,
      },
      candidate,
      branchRow
    );

    const companyLogoUrl = await resolveCompanyLogoUrlForUser(user.id);
    const submission = await createDocusealSubmission({
      templateId,
      submitterName: candidateName,
      submitterEmail: candidateEmail,
      externalId: offerId,
      sendEmail: true,
      redirectUrl: undefined,
      companyLogoUrl,
      prefillFields,
    });

    const { error: updateError } = await admin
      .from("job_offers")
      .update({ latest_docuseal_url: submission.signingUrl, updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (updateError) {
      throw new Error(`DocuSeal submission was created, but the job offer record could not be updated: ${updateError.message}`);
    }

    const notifiedIds = await notifyTenantOfferDecisionMakers({
      tenantId: resolvedTenantId,
      excludeUserId: user.id,
      type: "offer_letter",
      title: `Offer Handover: Standard Offer Sent for ${candidateName} (${job.title || "Job Role"})`,
      body: `A standard job offer was sent to ${candidateName} for ${job.title || "the role"} via DocuSeal. Review the outgoing contract for oversight.`,
      actionUrl: `/hr/offers/${offerId}`,
      senderId: user.id,
      actionName: "sendOfferWithDocuSeal",
    });

    revalidatePath(`/hr/applicants`);
    revalidatePath(`/hr/offers/${offerId}`);
    revalidatePath(`/hr/jobs/${jobId}/applicants`);

    return {
      success: true,
      url: submission.signingUrl,
      handoverNotified: notifiedIds.length > 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send offer via DocuSeal";
    console.error("[sendOfferWithDocuSeal]", { jobId, applicationId, offerId, error: message });
    return {
      success: false,
      error: message,
    };
  }
}

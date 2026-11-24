import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDocusealEmbedSrc } from "@/lib/docuseal-actions";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { OfferNegotiationRow } from "@/app/actions/offer-negotiation";
import {
  buildWorkScheduleSummary,
  clampWorkDaysPerWeek,
  normalizeRestDaysPolicy,
  normalizeScheduleType,
  normalizeShiftRotationPattern,
  normalizeShortWorkDays,
  resolveDefaultWorkDaysForCount,
} from "@/lib/schedule-policy";
import {
  formatLeaveCreditsDisplay,
  resolveLeavePolicyFromSources,
} from "@/lib/leave-policy";

export interface LoadedApplicantOffer {
  applicationId: string;
  applicationStatus: string | null;
  offerToken: string;
  offerStatus: string;
  isAlreadySigned: boolean;
  isHR: boolean;
  companyName: string;
  candidateFirstName: string;
  candidateEmail: string;
  jobTitle: string;
  location: string | null;
  employmentType: string | null;
  workSetup: string | null;
  department: string | null;
  startDate: string | null;
  expiresAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  hrEmail: string | null;
  signingUrl: string | null;
  embedSrc: string | null;
  docusealEmbedError: string | null;
  signedPdfUrl: string | null;
  negotiations: OfferNegotiationRow[];
  scheduleType: string;
  workDaysPerWeek: number;
  restDaysPolicy: string;
  shiftRotationPattern: string;
  shiftStart: string;
  shiftEnd: string;
  workDays: string[];
  workScheduleSummary: string;
  reportsTo: string | null;
  leaveCreditsSummary: string | null;
  hmoCoverageSummary: string | null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadApplicantOffer(
  routeId: string,
  options?: { includeSigningData?: boolean }
): Promise<LoadedApplicantOffer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const authRole = user.user_metadata?.role as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);
  const admin = getAdminClient();

  const appSelect = `
    id,
    job_id,
    contract_offer_id,
    applicant_id,
    status,
    profiles!job_applications_applicant_id_fkey (
      first_name,
      last_name,
      email
    ),
    job_postings!job_applications_job_id_fkey (
      id,
      tenant_id,
      title,
      location,
      work_location_id,
      work_setup,
      salary_min,
      salary_max,
      currency,
      employment_type,
      shift_start,
      shift_end,
      work_days,
      schedule_type,
      rest_days_type,
      leave_policy_type,
      vacation_leave_days,
      sick_leave_days,
      service_incentive_leave_days,
      leave_eligibility,
      offer_letter_settings,
      profiles!job_postings_created_by_fkey (
        email,
        tenants (
          name
        )
      )
    )
  `;

  let { data: rawApplication } = await admin
    .from("job_applications")
    .select(appSelect)
    .eq("id", routeId)
    .maybeSingle();

  if (!rawApplication) {
    const { data: offerById } = await admin
      .from("job_offers")
      .select("application_id")
      .eq("id", routeId)
      .maybeSingle();

    const resolvedAppId = offerById?.application_id
      ? offerById.application_id
      : (
          await admin
            .from("signed_documents")
            .select("application_id")
            .eq("id", routeId)
            .maybeSingle()
        ).data?.application_id;

    if (resolvedAppId) {
      const res = await admin
        .from("job_applications")
        .select(appSelect)
        .eq("id", resolvedAppId)
        .maybeSingle();
      rawApplication = res.data;
    }
  }

  if (!rawApplication) {
    redirect("/applicant/applications");
  }

  if (rawApplication.applicant_id !== user.id && !isHR) {
    redirect("/applicant/applications");
  }

  const jobOfferColumns =
    "id, status, salary, start_date, work_setup, work_mode, work_location_id, department, shift_start, shift_end, work_days, leave_policy_type, vacation_leave_days, sick_leave_days, service_incentive_leave_days, leave_eligibility, latest_docuseal_url, job_metadata, metadata, is_active, version_id, updated_at";

  const { data: activeOfferRow } = await admin
    .from("job_offers")
    .select(jobOfferColumns)
    .eq("application_id", rawApplication.id)
    .eq("is_active", true)
    .order("version_id", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: fallbackOfferRow } = activeOfferRow
    ? { data: null }
    : await admin
        .from("job_offers")
        .select(jobOfferColumns)
        .eq("application_id", rawApplication.id)
        .order("version_id", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const activeOffer = activeOfferRow ?? fallbackOfferRow;

  const signedDocSelect = "id, status, docuseal_submission_url, signed_at, pdf_file_path";
  const { data: signedDocById } = rawApplication.contract_offer_id
    ? await admin
        .from("signed_documents")
        .select(signedDocSelect)
        .eq("id", rawApplication.contract_offer_id)
        .maybeSingle()
    : { data: null };

  const { data: signedDocByApp } = signedDocById
    ? { data: null }
    : await admin
        .from("signed_documents")
        .select(signedDocSelect)
        .eq("application_id", rawApplication.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const signedDocument = signedDocById ?? signedDocByApp;

  if (!activeOffer && !signedDocument) {
    redirect(`/applicant/applications/${encodeURIComponent(rawApplication.id)}`);
  }

  const candidateProfile = toSingle(rawApplication.profiles) as {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;

  const jobPosting = toSingle(rawApplication.job_postings) as {
    id?: string;
    tenant_id?: string | null;
    title?: string | null;
    location?: string | null;
    work_location_id?: string | null;
    work_setup?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    currency?: string | null;
    employment_type?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    schedule_type?: string | null;
    rest_days_type?: string | null;
    offer_letter_settings?: Record<string, unknown> | null;
    profiles?:
      | {
          email?: string | null;
          tenants?: { name?: string | null } | { name?: string | null }[] | null;
        }
      | {
          email?: string | null;
          tenants?: { name?: string | null } | { name?: string | null }[] | null;
        }[]
      | null;
  } | null;

  const creatorProfile = toSingle(jobPosting?.profiles);
  const creatorTenant = toSingle(creatorProfile?.tenants);
  const offerMeta = ((activeOffer?.job_metadata ?? activeOffer?.metadata) || {}) as Record<
    string,
    unknown
  >;
  const metaCompanyName = normalizeText(offerMeta.company_name);

  const companyName =
    normalizeText(creatorTenant?.name) ||
    (metaCompanyName && metaCompanyName !== "Hiring Company" ? metaCompanyName : "") ||
    "Company";

  const jobSettingsEarly = (jobPosting?.offer_letter_settings ?? null) as Record<
    string,
    unknown
  > | null;
  const rawPostingLocation = jobPosting?.location?.trim() ?? "";
  const isUuidLocation = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    rawPostingLocation
  );
  const branchIdToResolve =
    activeOffer?.work_location_id ??
    jobPosting?.work_location_id ??
    (typeof jobSettingsEarly?.work_location_id === "string"
      ? jobSettingsEarly.work_location_id
      : null) ??
    (isUuidLocation ? rawPostingLocation : null);
  let resolvedLocation: string | null =
    rawPostingLocation && !isUuidLocation ? rawPostingLocation : null;
  if (branchIdToResolve) {
    const { data: branchRow } = await admin
      .from("office_branches")
      .select("name, address")
      .eq("id", branchIdToResolve)
      .maybeSingle();
    if (branchRow) {
      resolvedLocation = branchRow.address
        ? `${branchRow.name} — ${branchRow.address}`
        : branchRow.name;
    }
  }
  if (!resolvedLocation) {
    const setupNorm = String(
      activeOffer?.work_setup ?? activeOffer?.work_mode ?? jobPosting?.work_setup ?? ""
    )
      .trim()
      .toLowerCase();
    if (setupNorm === "remote" || setupNorm === "wfh") {
      resolvedLocation = "Remote";
    } else if (jobPosting?.tenant_id) {
      const { data: primaryBranch } = await admin
        .from("office_branches")
        .select("name, address")
        .eq("tenant_id", jobPosting.tenant_id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (primaryBranch) {
        resolvedLocation = primaryBranch.address
          ? `${primaryBranch.name} — ${primaryBranch.address}`
          : primaryBranch.name;
      }
    }
  }

  const rawOfferStatus = String(
    activeOffer?.status ?? signedDocument?.status ?? "sent"
  ).toLowerCase();
  const isAlreadySigned =
    ["signed", "accepted", "hired"].includes(rawOfferStatus) ||
    Boolean(signedDocument?.signed_at);

  let embedSrc: string | null = null;
  let docusealEmbedError: string | null = null;
  let negotiations: OfferNegotiationRow[] = [];

  if (options?.includeSigningData) {
    const { data: negotiationRows } = await admin
      .from("job_offer_negotiations")
      .select(
        "id, offer_id, application_id, initiator_id, round, target_field, current_value, requested_value, comments, status, counter_value, hr_comment, resolved_by, created_at, resolved_at"
      )
      .eq("application_id", rawApplication.id)
      .order("round", { ascending: true })
      .order("created_at", { ascending: true });

    negotiations = (negotiationRows ?? []) as OfferNegotiationRow[];

    const metaEmbedSrc = normalizeText(offerMeta.docuseal_embed_src);
    if (metaEmbedSrc) {
      embedSrc = metaEmbedSrc;
    } else if (activeOffer && !isAlreadySigned && rawOfferStatus !== "negotiating") {
      try {
        embedSrc = await getOrCreateDocusealEmbedSrc(activeOffer.id);
      } catch (err) {
        docusealEmbedError =
          err instanceof Error ? err.message : "Failed to load DocuSeal signing form";
      }
    }
  }

  const salaryValue =
    activeOffer?.salary != null ? Number(activeOffer.salary) : null;

  const jobSettings = (jobPosting?.offer_letter_settings ?? null) as Record<string, unknown> | null;
  const resolvedScheduleType = normalizeScheduleType(
    offerMeta.schedule_type ?? jobSettings?.schedule_type ?? jobPosting?.schedule_type
  );
  const resolvedShiftStart =
    (activeOffer as { shift_start?: string | null } | null)?.shift_start ??
    (typeof offerMeta.shift_start === "string" ? offerMeta.shift_start : null) ??
    jobPosting?.shift_start ??
    (typeof jobSettings?.shift_start === "string" ? jobSettings.shift_start : null) ??
    "08:00";
  const resolvedShiftEnd =
    (activeOffer as { shift_end?: string | null } | null)?.shift_end ??
    (typeof offerMeta.shift_end === "string" ? offerMeta.shift_end : null) ??
    jobPosting?.shift_end ??
    (typeof jobSettings?.shift_end === "string" ? jobSettings.shift_end : null) ??
    "17:00";
  const rawWorkDays = normalizeShortWorkDays(
    Array.isArray((activeOffer as { work_days?: string[] | null } | null)?.work_days) &&
      ((activeOffer as { work_days?: string[] | null }).work_days?.length ?? 0) > 0
      ? (activeOffer as { work_days?: string[] | null }).work_days
      : Array.isArray(offerMeta.work_days) && offerMeta.work_days.length > 0
        ? offerMeta.work_days
        : Array.isArray(jobPosting?.work_days) && jobPosting.work_days.length > 0
          ? jobPosting.work_days
          : jobSettings?.work_days
  );
  const workDaysPerWeek = clampWorkDaysPerWeek(
    offerMeta.work_days_per_week ?? jobSettings?.work_days_per_week,
    rawWorkDays.length > 0 ? rawWorkDays.length : 5
  );
  const restDaysPolicy = normalizeRestDaysPolicy(
    offerMeta.rest_days_policy ?? jobSettings?.rest_days_policy ?? jobPosting?.rest_days_type,
    resolvedScheduleType
  );
  const shiftRotationPattern = normalizeShiftRotationPattern(
    offerMeta.shift_rotation_pattern ?? jobSettings?.shift_rotation_pattern,
    resolvedScheduleType
  );
  const resolvedWorkDays =
    rawWorkDays.length > 0
      ? rawWorkDays
      : resolvedScheduleType === "rotating"
        ? resolveDefaultWorkDaysForCount(workDaysPerWeek)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const workScheduleSummary =
    (typeof offerMeta.work_schedule_summary === "string" && offerMeta.work_schedule_summary.trim()) ||
    buildWorkScheduleSummary({
      scheduleType: resolvedScheduleType,
      workDaysPerWeek,
      restDaysPolicy,
      shiftRotationPattern,
      shiftStart: resolvedShiftStart,
      shiftEnd: resolvedShiftEnd,
      workDays: resolvedWorkDays,
    });
  const reportsTo =
    (typeof offerMeta.reports_to_label === "string" && offerMeta.reports_to_label.trim()) ||
    (typeof offerMeta.reports_to === "string" && offerMeta.reports_to.trim()) ||
    null;

  const resolvedLeavePolicy = resolveLeavePolicyFromSources(
    (activeOffer as Record<string, unknown> | null) ??
      (jobPosting as Record<string, unknown> | null),
    { ...(jobSettings ?? {}), ...offerMeta }
  );
  const leaveCreditsSummary = formatLeaveCreditsDisplay(resolvedLeavePolicy);

  const rawCompPkg = (offerMeta.compensation_package ??
    jobSettings?.compensation_package ??
    null) as { hmo_coverage?: { enabled?: boolean; timing?: string } } | null;
  const hmoProviderText =
    (typeof offerMeta.hmo_provider === "string" && offerMeta.hmo_provider.trim()) ||
    (typeof offerMeta.phHmoProvider === "string" && offerMeta.phHmoProvider.trim()) ||
    (typeof jobSettings?.hmo_provider === "string" && jobSettings.hmo_provider.trim()) ||
    (typeof jobSettings?.phHmoProvider === "string" && jobSettings.phHmoProvider.trim()) ||
    null;
  const hmoCoverageSummary =
    hmoProviderText ||
    (rawCompPkg?.hmo_coverage?.enabled
      ? rawCompPkg.hmo_coverage.timing === "day_1"
        ? "Company HMO (Effective Day 1)"
        : "Company HMO (Upon Regularization)"
      : "Per Company Policy");

  return {
    applicationId: rawApplication.id,
    applicationStatus: rawApplication.status ?? null,
    offerToken: activeOffer?.id ?? signedDocument!.id,
    offerStatus: rawOfferStatus,
    isAlreadySigned,
    isHR,
    companyName,
    candidateFirstName:
      normalizeText(candidateProfile?.first_name) ||
      normalizeText(user.user_metadata?.first_name) ||
      "Candidate",
    candidateEmail:
      normalizeText(candidateProfile?.email) || normalizeText(user.email),
    jobTitle: jobPosting?.title ?? "Job Offer",
    location: resolvedLocation,
    employmentType: jobPosting?.employment_type ?? null,
    workSetup: activeOffer?.work_setup ?? activeOffer?.work_mode ?? jobPosting?.work_setup ?? null,
    department: activeOffer?.department ?? null,
    startDate: activeOffer?.start_date ?? null,
    expiresAt: null,
    salaryMin: salaryValue ?? jobPosting?.salary_min ?? null,
    salaryMax: salaryValue ?? jobPosting?.salary_max ?? null,
    currency: jobPosting?.currency ?? "PHP",
    hrEmail: normalizeText(creatorProfile?.email) || null,
    signingUrl:
      activeOffer?.latest_docuseal_url ?? signedDocument?.docuseal_submission_url ?? null,
    embedSrc:
      embedSrc ??
      activeOffer?.latest_docuseal_url ??
      signedDocument?.docuseal_submission_url ??
      null,
    docusealEmbedError,
    signedPdfUrl: signedDocument?.pdf_file_path ?? null,
    negotiations,
    scheduleType: resolvedScheduleType,
    workDaysPerWeek,
    restDaysPolicy,
    shiftRotationPattern,
    shiftStart: resolvedShiftStart,
    shiftEnd: resolvedShiftEnd,
    workDays: resolvedWorkDays,
    workScheduleSummary,
    reportsTo,
    leaveCreditsSummary,
    hmoCoverageSummary,
  };
}

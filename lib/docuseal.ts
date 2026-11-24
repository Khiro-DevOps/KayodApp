type DocusealSubmitter = {
  id?: number;
  uuid?: string;
  slug?: string;
  external_id?: string | null;
  embed_src?: string | null;
  email?: string | null;
  name?: string | null;
  status?: string | null;
};

type DocusealCreateSubmissionResponse = DocusealSubmitter[];

type DocusealSubmissionDocument = {
  name?: string;
  url?: string;
};

type DocusealFormWebhookPayload = {
  event_type?: string;
  timestamp?: string;
  data?: {
    external_id?: string | null;
    decline_reason?: string | null;
    completed_at?: string | null;
    declined_at?: string | null;
    audit_log_url?: string | null;
    combined_document_url?: string | null;
    submission?: {
      url?: string | null;
      combined_document_url?: string | null;
      audit_log_url?: string | null;
      status?: string | null;
      id?: number | null;
      documents?: DocusealSubmissionDocument[];
    };
    documents?: DocusealSubmissionDocument[];
    values?: Array<{ field?: string; value?: string }>;
  };
};

import { generateContractBody } from "@/lib/gemini";
import {
  computeCompensationTotals,
  formatCompensationSummaryText,
  parseCompensationPackage,
  type PhilippineCompensationPackage,
} from "@/lib/compensation-package";
import { JOB_LEVEL_LABELS, normalizeJobLevel } from "@/lib/workforce-hierarchy";
import {
  buildWorkScheduleSummary,
  clampWorkDaysPerWeek,
  formatRestDaysPolicyLabel,
  formatScheduleTime12h,
  formatScheduleTypeLabel,
  formatShiftRotationPatternLabel,
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

export function getDocusealBaseUrl() {
  return (
    process.env.DOCUSEAL_BASE_URL?.trim() ||
    process.env.DOCUSEAL_API_URL?.trim() ||
    "https://api.docuseal.com"
  ).replace(/\/+$/, "");
}

export function getDocusealApiBaseUrl() {
  return getDocusealBaseUrl();
}

function getDocusealApiKey() {
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DOCUSEAL_API_KEY is not configured");
  }
  return apiKey;
}

const DOCUSEAL_REQUEST_TIMEOUT_MS = 8000;

async function fetchDocusealWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DOCUSEAL_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function normalizeDocusealEmbedUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/embed/")) {
      parsed.pathname = `/embed${parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`}`;
    }
    return parsed.toString();
  } catch {
    if (url.includes("/embed/")) {
      return url;
    }

    return url.replace("/s/", "/embed/s/");
  }
}

export async function createDocusealSubmission(input: {
  templateId: string;
  submitterName: string;
  submitterEmail: string;
  externalId: string;
  sendEmail?: boolean;
  redirectUrl?: string;
  prefillFields?: Record<string, string>;
  companyLogoUrl?: string | null;
}) {
  const sendEmail = input.sendEmail ?? true;
  const submitterValues = {
    ...(input.prefillFields ?? {}),
    ...(input.companyLogoUrl?.trim() ? { company_logo_url: input.companyLogoUrl.trim() } : {}),
  };

  const response = await fetchDocusealWithTimeout(`${getDocusealBaseUrl()}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": getDocusealApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: Number.parseInt(input.templateId, 10),
      send_email: sendEmail,
      submitters: [
        {
          role: "Candidate",
          name: input.submitterName,
          email: input.submitterEmail,
          external_id: input.externalId,
          // DocuSeal expects submitter values as a keyed object map.
          values: submitterValues,
        },
      ],
      completed_redirect_url: input.redirectUrl,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Docuseal submission creation failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as DocusealCreateSubmissionResponse;
  const submitter = data[0];

  if (!submitter?.embed_src) {
    throw new Error("Docuseal did not return a signing URL");
  }

  const viewerUrl = submitter.slug ? `https://docuseal.com/s/${submitter.slug}` : null;

  return {
    submitterId: submitter.uuid ?? submitter.slug ?? null,
    embedSrc: submitter.embed_src,
    signingUrl: submitter.embed_src,
    viewerUrl,
    slug: submitter.slug ?? null,
    raw: data,
  };
}

export async function fetchDocusealTemplate(input: { templateId: string }) {
  const response = await fetchDocusealWithTimeout(`${getDocusealBaseUrl()}/templates/${input.templateId}`, {
    method: "GET",
    headers: {
      "X-Auth-Token": getDocusealApiKey(),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Docuseal template fetch failed: ${response.status} ${message}`);
  }

  const template = (await response.json()) as {
    id?: string | number;
    name?: string;
    fields?: Array<unknown>;
    submitters?: Array<{ fields?: Array<unknown> }>;
  };

  const directFieldCount = Array.isArray(template.fields) ? template.fields.length : 0;
  const submitterFieldCount = Array.isArray(template.submitters)
    ? template.submitters.reduce(
        (count, submitter) => count + (Array.isArray(submitter.fields) ? submitter.fields.length : 0),
        0
      )
    : 0;

  return {
    id: template.id?.toString() ?? input.templateId,
    name: template.name ?? null,
    fieldCount: Math.max(directFieldCount, submitterFieldCount),
    raw: template,
  };
}

export async function fetchDocusealSignedDocuments(input: { submissionId: number }) {
  const response = await fetchDocusealWithTimeout(`${getDocusealBaseUrl()}/submissions/${input.submissionId}/documents?merge=true`, {
    method: "GET",
    headers: {
      "X-Auth-Token": getDocusealApiKey(),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Docuseal signed document fetch failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as { documents?: DocusealSubmissionDocument[] };
  return payload.documents ?? [];
}

export async function downloadDocusealDocument(url: string) {
  const response = await fetchDocusealWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to download Docuseal document: ${response.status}`);
  }

  return response.arrayBuffer();
}

export function normalizeDocusealWebhook(payload: unknown) {
  return payload as DocusealFormWebhookPayload;
}

// ============================================================
// JOB OFFER LETTER HELPER FUNCTIONS
// ============================================================

export interface OfferLetterSettings {
  introMessage?: string;
  additionalTerms?: string;
  signingDeadlineDays?: number;
  requireCountersignature?: boolean;
  // Extended fields used by job creation form
  selectedBenefits?: string[];
  offerExpiryDays?: number;
  negotiationAllowed?: boolean;
  counterOfferAllowed?: boolean;
  offerNotes?: string;
  requirementsToProceed?: string;
  // Philippine-specific mapped fields
  phDepartment?: string;
  phSupervisorName?: string;
  phSupervisorTitle?: string;
  phEmploymentStatus?: string;
  phProbationPeriodDays?: number;
  phStartDate?: string;
  department?: string;
  supervisor_name?: string;
  supervisor_title?: string;
  employment_status?: string;
  probation_days?: number;
  expected_start_date?: string;
  phWorkSchedule?: string;
  phMonthlyBasicSalary?: number;
  phPayFrequency?: string;
  phSigningBonus?: number;
  phTransportAllowance?: number;
  phInternetAllowance?: number;
  phMealAllowance?: number;
  phNightDifferential?: number;
  phServiceIncentiveLeave?: number;
  phVacationLeaveDays?: number;
  phSickLeaveDays?: number;
  leave_policy_type?: string;
  vacation_leave_days?: number;
  sick_leave_days?: number;
  service_incentive_leave_days?: number;
  leave_eligibility?: string;
  leave_credits_summary?: string;
  phHmoProvider?: string;
  phMandatory13thMonth?: boolean;
  phSssEnrolled?: boolean;
  phPhilhealthEnrolled?: boolean;
  phPagibigEnrolled?: boolean;
  compensation_package?: PhilippineCompensationPackage;
  monthly_allowance?: number;
  attendance_incentive?: number;
  // Work schedule & shift rotation policy
  schedule_type?: string;
  work_days_per_week?: number;
  rest_days_policy?: string;
  shift_rotation_pattern?: string;
  shift_start?: string;
  shift_end?: string;
  work_days?: string[];
  work_schedule_summary?: string;
}

export interface JobOfferInput {
  jobTitle: string;
  department?: string;
  employmentType: string;
  location?: string;
  jobDescription?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
}

export interface TenantInfo {
  name: string;
  email?: string;
}

export const OFFER_TEMPLATE_VERSION = "v3-formal-ph-contract";

export const REQUIRED_OFFER_TEMPLATE_FIELDS = [
  "candidate_name",
  "job_title",
  "company_name",
  "department",
  "salary",
  "start_date",
  "work_setup",
  "work_location",
  "probation_days",
  "reporting_line",
  "allowances",
  "leave_credits",
  "hmo_coverage",
  "signature",
  "date_signed",
] as const;

export type OfferPrefillFields = {
  issue_date: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  job_level: string;
  department: string;
  employment_type: string;
  probation_days: string;
  start_date: string;
  reporting_line: string;
  work_setup: string;
  work_location: string;
  schedule_type: string;
  shift_rotation_pattern: string;
  shift_hours: string;
  work_days_per_week: string;
  rest_days_policy: string;
  work_schedule_summary: string;
  salary: string;
  pay_frequency: string;
  allowances: string;
  leave_credits: string;
  hmo_coverage: string;
};

function formatWorkSetupHumanLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "remote" || lower === "wfh") return "Remote";
  if (lower === "hybrid") return "Hybrid";
  if (lower === "onsite" || lower === "on_site" || lower === "on-site") return "Onsite";
  if (lower === "flexible") return "Flexible";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatEmploymentTypeHumanLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "Full-Time";
  if (value === "full_time" || value === "full-time") return "Full-Time";
  if (value === "part_time" || value === "part-time") return "Part-Time";
  if (value === "intern" || value === "internship") return "Internship";
  if (value === "contract" || value === "project_based" || value === "project-based") {
    return value === "contract" ? "Contract" : "Project-Based";
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export function buildOfferPrefillFields(
  offer: {
    salary?: number | string | null;
    start_date?: string | null;
    work_setup?: string | null;
    work_mode?: string | null;
    department?: string | null;
    probation_days?: number | string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    financial_package?: Record<string, unknown> | null;
    job_metadata?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  } | null | undefined,
  job: {
    title?: string | null;
    currency?: string | null;
    location?: string | null;
    employment_type?: string | null;
    company_name?: string | null;
    tenant_name?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    schedule_type?: string | null;
    rest_days_type?: string | null;
    rest_days_policy?: string | null;
    shift_rotation_pattern?: string | null;
    work_days_per_week?: number | null;
    reports_to?: string | null;
    supervisor_name?: string | null;
    supervisor_title?: string | null;
    expected_start_date?: string | null;
    target_job_level?: string | null;
    pay_frequency?: string | null;
    hmo_provider?: string | null;
    service_incentive_leave?: number | null;
    vacation_leave_days?: number | null;
    sick_leave_days?: number | null;
  } | null | undefined,
  applicant: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null | undefined,
  branch?: {
    name?: string | null;
    address?: string | null;
  } | null
): OfferPrefillFields {
  const candidateName = [applicant?.first_name?.trim(), applicant?.last_name?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  const offerMeta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
  const jobTitle = String(
    (typeof offerMeta.job_title === "string" && offerMeta.job_title.trim()) ||
      job?.title ||
      ""
  ).trim();

  const companyName = String(
    job?.company_name ||
      job?.tenant_name ||
      (typeof offerMeta.company_name === "string" && offerMeta.company_name.trim()) ||
      ""
  ).trim();

  const department = String(offer?.department ?? "").trim();

  const currency = String(job?.currency || "PHP").trim() || "PHP";
  const rawSalary = offer?.salary;
  const numericSalary =
    rawSalary !== null && rawSalary !== undefined && String(rawSalary).trim() !== ""
      ? Number(rawSalary)
      : null;
  const salary =
    numericSalary !== null && Number.isFinite(numericSalary)
      ? new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency,
        }).format(numericSalary)
      : "";

  let startDate = "";
  const rawStartDate =
    offer?.start_date ??
    (typeof offerMeta.start_date === "string" ? offerMeta.start_date : null) ??
    (typeof offerMeta.expected_start_date === "string" ? offerMeta.expected_start_date : null) ??
    job?.expected_start_date ??
    null;
  const trimmedStartDate = rawStartDate ? String(rawStartDate).trim() : "";
  if (trimmedStartDate) {
    const parsed = new Date(trimmedStartDate.includes("T") ? trimmedStartDate : `${trimmedStartDate}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      startDate = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
    } else {
      startDate = trimmedStartDate;
    }
  }

  const workSetup = formatWorkSetupHumanLabel(offer?.work_setup ?? offer?.work_mode ?? "");
  const employmentTypeLabel = formatEmploymentTypeHumanLabel(
    (typeof offerMeta.employment_type === "string" ? offerMeta.employment_type : null) ??
      job?.employment_type ??
      "full_time"
  );

  const branchParts = [branch?.name?.trim(), branch?.address?.trim()].filter(Boolean);
  const rawJobLocation = String(job?.location ?? "").trim();
  const workLocation =
    branchParts.length > 0
      ? branchParts.join(" — ")
      : rawJobLocation && !isUuidLike(rawJobLocation)
        ? rawJobLocation
        : workSetup === "Remote"
          ? "Remote"
          : "";

  const probationDays =
    offer?.probation_days !== null &&
    offer?.probation_days !== undefined &&
    String(offer.probation_days).trim() !== ""
      ? String(offer.probation_days).trim()
      : "";

  const offerPkg = (offer?.financial_package ?? {}) as Record<string, unknown>;
  const formatOptionalAmount = (raw: unknown): string => {
    const parsed =
      raw !== null && raw !== undefined && String(raw).trim() !== ""
        ? Number(raw)
        : null;
    if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
      return "";
    }
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
    }).format(parsed);
  };

  const compPkg = parseCompensationPackage(
    offerPkg.compensation_package ?? offerMeta.compensation_package,
    { ...offerMeta, ...offerPkg }
  );
  const compTotals = computeCompensationTotals(compPkg, numericSalary ?? 0);

  const monthlyAllowance = formatOptionalAmount(
    offerPkg.monthly_allowance ?? offerMeta.monthly_allowance ?? compTotals.monthlyAllowancesTotal
  );
  const riceAllowance = formatOptionalAmount(
    compPkg.rice_allowance.enabled ? compPkg.rice_allowance.amount : 0
  );
  const transportAllowance = formatOptionalAmount(
    compPkg.transport_allowance.enabled ? compPkg.transport_allowance.amount : 0
  );
  const internetAllowance = formatOptionalAmount(
    compPkg.internet_allowance.enabled ? compPkg.internet_allowance.amount : 0
  );
  const mealAllowance = formatOptionalAmount(
    compPkg.meal_allowance.enabled ? compPkg.meal_allowance.amount : 0
  );
  const clothingAllowance = formatOptionalAmount(
    compPkg.clothing_allowance.enabled ? compPkg.clothing_allowance.amount : 0
  );
  const attendanceIncentive = formatOptionalAmount(
    offerPkg.attendance_incentive ??
      offerMeta.attendance_incentive ??
      compTotals.attendanceIncentiveAmount
  );
  const performanceBonus = formatOptionalAmount(
    compPkg.performance_bonus.enabled ? compPkg.performance_bonus.amount : 0
  );
  const totalMonthlyPackage = formatOptionalAmount(compTotals.totalMonthlyPackage);

  const shiftStartStr = (
    offer?.shift_start ??
    (typeof offerMeta.shift_start === "string" ? offerMeta.shift_start : null) ??
    job?.shift_start ??
    "08:00"
  ).slice(0, 5);
  const shiftEndStr = (
    offer?.shift_end ??
    (typeof offerMeta.shift_end === "string" ? offerMeta.shift_end : null) ??
    job?.shift_end ??
    "17:00"
  ).slice(0, 5);
  const resolvedScheduleType = normalizeScheduleType(
    offerMeta.schedule_type ?? job?.schedule_type
  );
  const rawOfferWorkDays = normalizeShortWorkDays(
    Array.isArray(offer?.work_days) && offer.work_days.length > 0
      ? offer.work_days
      : Array.isArray(offerMeta.work_days) && offerMeta.work_days.length > 0
        ? offerMeta.work_days
        : job?.work_days
  );
  const workDaysPerWeekNum = clampWorkDaysPerWeek(
    offerMeta.work_days_per_week ?? job?.work_days_per_week,
    rawOfferWorkDays.length > 0 ? rawOfferWorkDays.length : 5
  );
  const resolvedRestDaysPolicy = normalizeRestDaysPolicy(
    offerMeta.rest_days_policy ?? job?.rest_days_policy ?? job?.rest_days_type,
    resolvedScheduleType
  );
  const resolvedShiftRotationPattern = normalizeShiftRotationPattern(
    offerMeta.shift_rotation_pattern ?? job?.shift_rotation_pattern,
    resolvedScheduleType
  );
  const workDaysArr =
    rawOfferWorkDays.length > 0
      ? rawOfferWorkDays
      : resolvedScheduleType === "rotating"
        ? resolveDefaultWorkDaysForCount(workDaysPerWeekNum)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const shiftHoursLabel = `${formatScheduleTime12h(shiftStartStr)} – ${formatScheduleTime12h(shiftEndStr)} PHT`;
  const scheduleTypeLabel = formatScheduleTypeLabel(resolvedScheduleType);
  const restDaysPolicyLabel = formatRestDaysPolicyLabel(resolvedRestDaysPolicy);
  const shiftRotationPatternLabel = formatShiftRotationPatternLabel(resolvedShiftRotationPattern);
  const workScheduleSummary =
    (typeof offerMeta.work_schedule_summary === "string" && offerMeta.work_schedule_summary.trim()) ||
    buildWorkScheduleSummary({
      scheduleType: resolvedScheduleType,
      workDaysPerWeek: workDaysPerWeekNum,
      restDaysPolicy: resolvedRestDaysPolicy,
      shiftRotationPattern: resolvedShiftRotationPattern,
      shiftStart: shiftStartStr,
      shiftEnd: shiftEndStr,
      workDays: workDaysArr,
    });
  const workScheduleAndBreaks =
    resolvedScheduleType === "rotating"
      ? `${workScheduleSummary} (8 hrs paid + 1 hr unpaid lunch, 2 × 15-min paid breaks)`
      : `${workDaysArr.join(", ")} · ${shiftStartStr} – ${shiftEndStr} PHT (8 hrs paid + 1 hr unpaid lunch, 2 × 15-min paid breaks)`;

  const probationTerms = probationDays
    ? `${probationDays} Calendar Days (pursuant to Art. 296 of the Labor Code of the Philippines)`
    : "Regular employment terms";

  const issueDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date());

  const candidateEmail = applicant?.email?.trim() ?? "";

  const rawPayFreq = String(
    (typeof offerMeta.pay_frequency === "string" && offerMeta.pay_frequency.trim()) ||
      job?.pay_frequency ||
      "semi_monthly"
  )
    .trim()
    .toLowerCase();
  const payFrequencyLabel =
    rawPayFreq === "monthly"
      ? "Monthly"
      : rawPayFreq === "weekly"
        ? "Weekly"
        : "Semi-Monthly (15th & 30th)";

  const allowanceItems: string[] = [];
  if (riceAllowance) allowanceItems.push(`Rice Subsidy: ${riceAllowance}/mo`);
  if (mealAllowance) allowanceItems.push(`Meal Allowance: ${mealAllowance}/mo`);
  if (internetAllowance) allowanceItems.push(`Communication / Internet: ${internetAllowance}/mo`);
  if (transportAllowance) allowanceItems.push(`Transportation: ${transportAllowance}/mo`);
  if (clothingAllowance) allowanceItems.push(`Clothing / Uniform: ${clothingAllowance}/mo`);
  if (attendanceIncentive) allowanceItems.push(`Attendance / KPI Incentive: ${attendanceIncentive}/mo`);
  if (performanceBonus) allowanceItems.push(`Performance Bonus: ${performanceBonus}/mo`);
  if (allowanceItems.length === 0 && monthlyAllowance) {
    allowanceItems.push(`Monthly Allowances: ${monthlyAllowance}/mo`);
  }
  const allowancesText =
    allowanceItems.length > 0
      ? `${allowanceItems.join(" • ")} | Statutory 13th-Month Pay (PD 851) & SSS / PhilHealth / Pag-IBIG`
      : "None / Base Salary Only | Statutory 13th-Month Pay (PD 851) & SSS / PhilHealth / Pag-IBIG";

  const hmoCoverage =
    (typeof offerMeta.hmo_provider === "string" && offerMeta.hmo_provider.trim()) ||
    job?.hmo_provider?.trim() ||
    (compPkg.hmo_coverage?.enabled
      ? compPkg.hmo_coverage.timing === "day_1"
        ? "HMO (Day 1)"
        : "HMO (Upon Regularization)"
      : "Per Company Policy");

  const offerRecord = offer as Record<string, unknown>;
  const jobRecord = (job ?? {}) as Record<string, unknown>;
  const hasExplicitStructuredPolicy =
    typeof offerRecord.leave_policy_type === "string" ||
    typeof jobRecord.leave_policy_type === "string" ||
    typeof offerMeta.leave_policy_type === "string";

  let leaveCreditsText: string;
  if (hasExplicitStructuredPolicy) {
    const structuredPolicy = resolveLeavePolicyFromSources(
      offerRecord.leave_policy_type ? offerRecord : jobRecord,
      offerMeta
    );
    leaveCreditsText = `${formatLeaveCreditsDisplay(structuredPolicy)} • Statutory Leaves (Maternity, Paternity, Solo Parent, VAWC, Magna Carta)`;
  } else {
    const silDays =
      Number(
        offerMeta.service_incentive_leave ??
          offerMeta.phServiceIncentiveLeave ??
          job?.service_incentive_leave ??
          5
      ) || 5;
    const vlDays =
      Number(
        offerMeta.vacation_leave_days ??
          offerMeta.phVacationLeaveDays ??
          job?.vacation_leave_days ??
          0
      ) || 0;
    const slDays =
      Number(
        offerMeta.sick_leave_days ??
          offerMeta.phSickLeaveDays ??
          job?.sick_leave_days ??
          0
      ) || 0;
    const leaveParts = [
      `${silDays} SIL / year (Art. 95, Labor Code)`,
      ...(vlDays > 0 ? [`${vlDays} VL / year`] : []),
      ...(slDays > 0 ? [`${slDays} SL / year`] : []),
      "Statutory Leaves (Maternity, Paternity, Solo Parent, Special Leaves)",
    ];
    leaveCreditsText = leaveParts.join(" • ");
  }

  const supervisorName = String(
    (typeof offerMeta.supervisor_name === "string" && offerMeta.supervisor_name.trim()) ||
      job?.supervisor_name ||
      ""
  ).trim();
  const supervisorTitle = String(
    (typeof offerMeta.supervisor_title === "string" && offerMeta.supervisor_title.trim()) ||
      job?.supervisor_title ||
      ""
  ).trim();
  const reportingLine = String(
    (typeof offerMeta.reports_to_label === "string" && offerMeta.reports_to_label.trim()) ||
      (typeof offerMeta.reports_to === "string" && offerMeta.reports_to.trim()) ||
      job?.reports_to ||
      (supervisorName
        ? supervisorTitle
          ? `${supervisorName} — ${supervisorTitle}`
          : supervisorName
        : "")
  ).trim();
  const rawJobLevel =
    (typeof offerMeta.target_job_level === "string" && offerMeta.target_job_level.trim()) ||
    job?.target_job_level ||
    "";
  const jobLevel = rawJobLevel ? JOB_LEVEL_LABELS[normalizeJobLevel(rawJobLevel)] : "Staff";

  return {
    issue_date: issueDate,
    company_name: companyName || "Company",
    candidate_name: candidateName || "Candidate",
    candidate_email: candidateEmail || "N/A",
    job_title: jobTitle || "Position",
    job_level: jobLevel,
    department: department || "General",
    employment_type: employmentTypeLabel,
    probation_days: probationTerms,
    start_date: startDate || "To be confirmed",
    reporting_line: reportingLine || "Assigned Direct Supervisor",
    work_setup: workSetup || "Onsite",
    work_location: workLocation || (workSetup === "Remote" ? "Remote" : "Company Office"),
    schedule_type: scheduleTypeLabel,
    shift_rotation_pattern: shiftRotationPatternLabel,
    shift_hours: shiftHoursLabel,
    work_days_per_week: `${workDaysPerWeekNum} Work Days / Week`,
    rest_days_policy: restDaysPolicyLabel,
    work_schedule_summary: workScheduleSummary,
    salary: salary || "PHP 0.00",
    pay_frequency: payFrequencyLabel,
    allowances: allowancesText,
    leave_credits: leaveCreditsText,
    hmo_coverage: hmoCoverage,
  };
}

/**
 * Build an HTML string for the offer letter that will be sent to DocuSeal
 */
export function buildOfferLetterHtml(
  job: JobOfferInput,
  tenant: TenantInfo,
  settings?: OfferLetterSettings
): string {
  const additionalTerms = settings?.additionalTerms?.trim() || "";
  const roField = (name: string, multiline = false) =>
    `<text-field name="${name}" role="Candidate" readonly="true" style="display: block; width: 100%; min-height: ${multiline ? "38px" : "22px"}; font-size: 13px; line-height: 1.4; text-align: left; border: none; background: transparent; color: #111827;"></text-field>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Philippine Employment Offer &amp; Contract Agreement (${OFFER_TEMPLATE_VERSION})</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #111827;
      max-width: 820px;
      margin: 0 auto;
      padding: 24px 18px;
      background: #ffffff;
    }
    .container {
      background: #ffffff;
      padding: 32px 36px;
      border: 1px solid #d1d5db;
    }
    .header {
      border-bottom: 2px solid #1e1b4b;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .company-name {
      font-size: 22px;
      font-weight: 700;
      color: #1e1b4b;
      margin: 0;
      letter-spacing: 0.01em;
    }
    .doc-title {
      font-size: 11px;
      font-weight: 700;
      color: #4b5563;
      margin: 4px 0 0 0;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .opening-paragraph {
      font-size: 13px;
      color: #1f2937;
      margin: 0 0 20px 0;
      line-height: 1.6;
    }
    .section {
      margin: 18px 0;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #1e1b4b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 5px;
      margin-bottom: 8px;
    }
    .schedule-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 13px;
    }
    .schedule-table tr {
      border-bottom: 1px solid #e5e7eb;
    }
    .schedule-table tr:last-child {
      border-bottom: none;
    }
    .schedule-table th {
      text-align: left;
      padding: 7px 12px 7px 0;
      font-weight: 600;
      color: #374151;
      vertical-align: top;
      font-size: 13px;
    }
    .schedule-table td {
      text-align: left;
      padding: 7px 0;
      color: #111827;
      vertical-align: top;
      font-size: 13px;
    }
    .legal-clause {
      font-size: 12.5px;
      color: #374151;
      margin: 10px 0 0 0;
      padding: 10px 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      line-height: 1.5;
    }
    .legal-clause strong {
      color: #111827;
    }
    .legal-list {
      margin: 8px 0 0 0;
      padding-left: 18px;
      font-size: 12.5px;
      color: #374151;
    }
    .legal-list li {
      margin-bottom: 7px;
      line-height: 1.5;
    }
    .signature-section {
      margin-top: 26px;
      padding-top: 16px;
      border-top: 2px solid #1e1b4b;
      font-size: 13px;
    }
    .signature-declaration {
      font-size: 12.5px;
      color: #374151;
      margin-bottom: 16px;
    }
    .signature-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    .signature-table td {
      padding: 8px 16px 8px 0;
      vertical-align: bottom;
    }
    .sig-field {
      border-bottom: 1px solid #9ca3af;
      padding-bottom: 4px;
    }
    .sig-label {
      font-size: 11px;
      font-weight: 600;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 4px;
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="company-name">${escapeHtml(tenant.name)}</p>
      <p class="doc-title">Philippine Employment Offer &amp; Contract Agreement</p>
    </div>

    <p class="opening-paragraph">
      This Employment Offer &amp; Contract Agreement (&ldquo;Agreement&rdquo;) sets forth the formal offer of employment
      extended by <strong>${escapeHtml(tenant.name)}</strong> (&ldquo;Company&rdquo;) to the Candidate named below,
      subject to the terms, compensation schedule, and statutory provisions of the Labor Code of the Philippines.
    </p>

    <div class="section">
      <div class="section-title">Parties &amp; Issuance Details</div>
      <table class="schedule-table">
        <colgroup>
          <col style="width: 32%;">
          <col style="width: 68%;">
        </colgroup>
        <tr>
          <th>Date of Issuance</th>
          <td>${roField("issue_date")}</td>
        </tr>
        <tr>
          <th>Employer / Company</th>
          <td>${roField("company_name")}</td>
        </tr>
        <tr>
          <th>Candidate Full Name</th>
          <td>${roField("candidate_name")}</td>
        </tr>
        <tr>
          <th>Candidate Email</th>
          <td>${roField("candidate_email")}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Section 1 &mdash; Position, Reporting Line &amp; Work Arrangement</div>
      <table class="schedule-table">
        <colgroup>
          <col style="width: 32%;">
          <col style="width: 68%;">
        </colgroup>
        <tr>
          <th>Position Title</th>
          <td>${roField("job_title")}</td>
        </tr>
        <tr>
          <th>Role Tier / Job Level</th>
          <td>${roField("job_level")}</td>
        </tr>
        <tr>
          <th>Department</th>
          <td>${roField("department")}</td>
        </tr>
        <tr>
          <th>Employment Type</th>
          <td>${roField("employment_type")}</td>
        </tr>
        <tr>
          <th>Probationary Period</th>
          <td>${roField("probation_days", true)}</td>
        </tr>
        <tr>
          <th>Target Start Date</th>
          <td>${roField("start_date")}</td>
        </tr>
        <tr>
          <th>Reporting Line</th>
          <td>${roField("reporting_line", true)}</td>
        </tr>
        <tr>
          <th>Work Setup</th>
          <td>${roField("work_setup")}</td>
        </tr>
        <tr>
          <th>Physical Office Location</th>
          <td>${roField("work_location", true)}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Section 2 &mdash; Work Hours, Shift Rotation &amp; Rest Days</div>
      <table class="schedule-table">
        <colgroup>
          <col style="width: 32%;">
          <col style="width: 68%;">
        </colgroup>
        <tr>
          <th>Schedule Type</th>
          <td>${roField("schedule_type")}</td>
        </tr>
        <tr>
          <th>Shift Rotation Pattern</th>
          <td>${roField("shift_rotation_pattern", true)}</td>
        </tr>
        <tr>
          <th>Initial Shift Hours</th>
          <td>${roField("shift_hours")}</td>
        </tr>
        <tr>
          <th>Work Days per Week</th>
          <td>${roField("work_days_per_week")}</td>
        </tr>
        <tr>
          <th>Rest Days Policy</th>
          <td>${roField("rest_days_policy")}</td>
        </tr>
        <tr>
          <th>Work Schedule Summary</th>
          <td>${roField("work_schedule_summary", true)}</td>
        </tr>
      </table>
      <div class="legal-clause">
        <strong>Night Shift Differential (Art. 86, Labor Code of the Philippines):</strong>
        For work performed between 10:00 PM and 6:00 AM, the Employee shall be paid a Night Shift Differential
        of not less than ten percent (10%) of their regular wage for each hour of work performed during such period,
        in addition to applicable overtime, rest-day, or holiday premiums mandated by Philippine labor law.
      </div>
    </div>

    <div class="section">
      <div class="section-title">Section 3 &mdash; Compensation, Allowances &amp; Statutory Benefits</div>
      <table class="schedule-table">
        <colgroup>
          <col style="width: 32%;">
          <col style="width: 68%;">
        </colgroup>
        <tr>
          <th>Monthly Basic Salary</th>
          <td>${roField("salary")}</td>
        </tr>
        <tr>
          <th>Pay Frequency</th>
          <td>${roField("pay_frequency")}</td>
        </tr>
        <tr>
          <th>Monthly Allowances &amp; Incentives</th>
          <td>${roField("allowances", true)}</td>
        </tr>
        <tr>
          <th>Leave Credits</th>
          <td>${roField("leave_credits", true)}</td>
        </tr>
        <tr>
          <th>HMO / Medical Coverage</th>
          <td>${roField("hmo_coverage", true)}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Section 4 &mdash; Confidentiality, Probationary Terms &amp; Acceptance</div>
      <ol class="legal-list">
        <li>
          <strong>Probationary &amp; Regularization Standards:</strong> Where a probationary period applies,
          continued employment and regularization are subject to reasonable performance, conduct, and attendance
          standards communicated to the Employee upon onboarding pursuant to Article 296 of the Labor Code of the Philippines.
        </li>
        <li>
          <strong>Confidentiality &amp; Company Property:</strong> During and after employment, the Employee shall
          maintain strict confidentiality over all proprietary, client, operational, and financial information of
          ${escapeHtml(tenant.name)} and shall return all Company assets upon separation.
        </li>
        <li>
          <strong>Governing Law &amp; Entire Agreement:</strong> This Agreement is governed by the laws of the Republic
          of the Philippines and supersedes prior verbal representations regarding the terms stated herein.
        </li>
      </ol>
      ${additionalTerms ? `
      <div class="legal-clause">
        <strong>Additional Stipulations:</strong> ${escapeHtml(additionalTerms)}
      </div>
      ` : ""}
    </div>

    <div class="signature-section">
      <p class="signature-declaration">
        By signing below, I acknowledge that I have read, understood, and voluntarily accept the terms and conditions
        of this Employment Offer &amp; Contract Agreement with <strong>${escapeHtml(tenant.name)}</strong>.
      </p>
      <table class="signature-table">
        <colgroup>
          <col style="width: 55%;">
          <col style="width: 45%;">
        </colgroup>
        <tr>
          <td>
            <div class="sig-field">
              <text-field name="candidate_name" role="Candidate" style="display: block; width: 100%; min-height: 24px; font-size: 13px; text-align: left;"></text-field>
            </div>
            <span class="sig-label">Candidate Printed Name</span>
          </td>
          <td>
            <div class="sig-field">
              <date-field name="date_signed" role="Candidate" style="display: block; width: 100%; min-height: 24px; font-size: 13px; text-align: left;"></date-field>
            </div>
            <span class="sig-label">Date Signed</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top: 14px;">
            <div class="sig-field">
              <signature-field name="signature" role="Candidate" style="display: block; width: 320px; height: 48px;"></signature-field>
            </div>
            <span class="sig-label">Candidate Signature</span>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Create a DocuSeal template for job offer letters
 */

export async function createJobOfferTemplate(
  job: JobOfferInput,
  tenant: TenantInfo,
  settings?: OfferLetterSettings
): Promise<string> {
  const html = buildOfferLetterHtml(job, tenant, settings);
  const signingDeadlineDays = settings?.signingDeadlineDays ?? 7;
  const requireCountersignature = settings?.requireCountersignature ?? false;

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + signingDeadlineDays);

  const templateName = `${tenant.name} — ${job.jobTitle} Offer Letter [${OFFER_TEMPLATE_VERSION}]`;

  // ── Step 1: Create the template from HTML ──────────────────
  const createResponse = await fetch(`${getDocusealBaseUrl()}/templates/html`, {
    method: "POST",
    headers: {
      "X-Auth-Token": getDocusealApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: templateName,
      html,
      expire_at: expireAt.toISOString(),
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`DocuSeal template creation failed: ${createResponse.status} ${errorText}`);
  }

  const createData = (await createResponse.json()) as { id?: string | number };
  const templateId = createData.id?.toString();

  if (!templateId) {
    throw new Error("DocuSeal did not return a template ID");
  }

  return templateId;
}

/**
 * Utility: escape HTML to prevent injection
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
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
  phHmoProvider?: string;
  phMandatory13thMonth?: boolean;
  phSssEnrolled?: boolean;
  phPhilhealthEnrolled?: boolean;
  phPagibigEnrolled?: boolean;
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

const DEFAULT_OFFER_INTRO = `Dear Candidate,

We are pleased to extend an offer of employment to you for the position of {{job_title}} at {{company_name}}.

We believe you will be an excellent addition to our team, and we look forward to welcoming you on board.`;

const DEFAULT_OFFER_CLOSING = `Please review this offer carefully and sign below to indicate your acceptance.

We look forward to working with you!`;

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
  "signature",
  "date_signed",
] as const;

export type OfferPrefillFields = {
  candidate_name: string;
  job_title: string;
  company_name: string;
  department: string;
  salary: string;
  start_date: string;
  work_setup: string;
  work_location: string;
  probation_days: string;
};

function formatWorkSetupHumanLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "remote") return "Remote";
  if (lower === "hybrid") return "Hybrid";
  if (lower === "onsite" || lower === "on_site" || lower === "on-site") return "On-site";
  if (lower === "flexible") return "Flexible";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function buildOfferPrefillFields(
  offer: {
    salary?: number | string | null;
    start_date?: string | null;
    work_setup?: string | null;
    work_mode?: string | null;
    department?: string | null;
    probation_days?: number | string | null;
    job_metadata?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  } | null | undefined,
  job: {
    title?: string | null;
    currency?: string | null;
    location?: string | null;
    company_name?: string | null;
    tenant_name?: string | null;
  } | null | undefined,
  applicant: {
    first_name?: string | null;
    last_name?: string | null;
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
    (typeof offerMeta.company_name === "string" && offerMeta.company_name.trim()) ||
      job?.company_name ||
      job?.tenant_name ||
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
  const rawStartDate = offer?.start_date ? String(offer.start_date).trim() : "";
  if (rawStartDate) {
    const parsed = new Date(rawStartDate.includes("T") ? rawStartDate : `${rawStartDate}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      startDate = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
    } else {
      startDate = rawStartDate;
    }
  }

  const workSetup = formatWorkSetupHumanLabel(offer?.work_setup ?? offer?.work_mode ?? "");

  const branchParts = [branch?.name?.trim(), branch?.address?.trim()].filter(Boolean);
  const workLocation =
    branchParts.length > 0
      ? branchParts.join(", ")
      : String(job?.location ?? "").trim();

  const probationDays =
    offer?.probation_days !== null &&
    offer?.probation_days !== undefined &&
    String(offer.probation_days).trim() !== ""
      ? String(offer.probation_days).trim()
      : "";

  return {
    candidate_name: candidateName,
    job_title: jobTitle,
    company_name: companyName,
    department,
    salary,
    start_date: startDate,
    work_setup: workSetup,
    work_location: workLocation,
    probation_days: probationDays,
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
  const rawIntro = settings?.introMessage || DEFAULT_OFFER_INTRO;

  // Helper: replace common merge-tag styles ({{job_title}} and [JOB_TITLE])
  function applyMergeTags(text: string) {
    return text
      .replace(/\{\{job_title\}\}/gi, "[JOB_TITLE]")
      .replace(/\{\{company_name\}\}/gi, "[COMPANY_NAME]")
      // Normalize other common placeholders to bracket form
      .replace(/\{\{location\}\}/gi, "[LOCATION]")
      .replace(/\{\{salary\}\}/gi, "[SALARY]")
      // Uppercase bracket form to ensure case-insensitive handling
      .replace(/\[job_title\]/gi, "[JOB_TITLE]")
      .replace(/\[company_name\]/gi, "[COMPANY_NAME]")
      .replace(/\[location\]/gi, "[LOCATION]")
      .replace(/\[salary\]/gi, "[SALARY]");
  }

  // Convert merge tags into DocuSeal inline form fields after escaping
  function injectFieldTags(escaped: string) {
    return escaped
      .replace(/\[JOB_TITLE\]/g,
        `<text-field name="job_title" role="Candidate" readonly="true" style="display:inline-block;width:280px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field>`
      )
      .replace(/\[COMPANY_NAME\]/g,
        `<text-field name="company_name" role="Candidate" readonly="true" style="display:inline-block;width:200px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field>`
      )
      .replace(/\[LOCATION\]/g,
        `<text-field name="location" role="Candidate" readonly="true" style="display:inline-block;width:200px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field>`
      )
      .replace(/\[SALARY\]/g,
        `<text-field name="salary" role="Candidate" readonly="true" style="display:inline-block;width:220px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field>`
      );
  }

  // Escape HTML first, normalize placeholders, then inject DocuSeal field tags
  const escapedIntro = injectFieldTags(escapeHtml(applyMergeTags(rawIntro)));
  const additionalTerms = settings?.additionalTerms || "";
  const hasCountersignature = settings?.requireCountersignature ?? false;

  let salaryText = "";
  if (job.salary_min || job.salary_max) {
    const currency = job.currency || "PHP";
    if (job.salary_min && job.salary_max) {
      salaryText = `<strong>Salary Range:</strong> ${currency} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}`;
    } else if (job.salary_min) {
      salaryText = `<strong>Salary:</strong> ${currency} ${job.salary_min.toLocaleString()}`;
    } else if (job.salary_max) {
      salaryText = `<strong>Salary:</strong> Up to ${currency} ${job.salary_max.toLocaleString()}`;
    }
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Offer Letter</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f9fafb;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 30px;
      margin-bottom: 30px;
    }
    .company-logo-wrap {
      min-height: 72px;
      margin-bottom: 12px;
    }
    .company-name {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
    }
    .content {
      margin: 30px 0;
    }
    .intro-section {
      margin-bottom: 30px;
      white-space: pre-wrap;
    }
    .details-section {
      background: #f3f4f6;
      padding: 20px;
      border-radius: 6px;
      margin: 30px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #374151;
      min-width: 150px;
    }
    .detail-value {
      color: #1f2937;
    }
    .terms-section {
      margin: 30px 0;
    }
    .terms-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .terms-content {
      white-space: pre-wrap;
      background: #f3f4f6;
      padding: 15px;
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
    }
    .signature-section {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
    }
    .signature-block {
      margin-bottom: 40px;
    }
    .signature-role {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .signature-line {
      margin: 10px 0;
    }
    .signature-label {
      font-size: 12px;
      color: #6b7280;
    }
    .closing {
      margin-top: 30px;
      white-space: pre-wrap;
      color: #1f2937;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="company-name">${escapeHtml(tenant.name)}</p>
    </div>

    <div class="content">
      <div class="intro-section">${escapedIntro}</div>

      <div class="details-section">
        <div class="detail-row">
          <span class="detail-label">Position:</span>
          <span class="detail-value">${escapeHtml(job.jobTitle)}</span>
        </div>
        ${job.department ? `
        <div class="detail-row">
          <span class="detail-label">Department:</span>
          <span class="detail-value">${escapeHtml(job.department)}</span>
        </div>
        ` : ""}
        <div class="detail-row">
          <span class="detail-label">Employment Type:</span>
          <span class="detail-value">${escapeHtml(job.employmentType)}</span>
        </div>
        ${job.location ? `
        <div class="detail-row">
          <span class="detail-label">Location:</span>
          <span class="detail-value">${escapeHtml(job.location)}</span>
        </div>
        ` : ""}
        ${salaryText ? `
        <div class="detail-row">
          <span class="detail-label">Compensation:</span>
          <span class="detail-value">${salaryText}</span>
        </div>
        ` : ""}
      </div>

      ${job.jobDescription ? `
      <div class="terms-section">
        <div class="terms-title">Position Overview</div>
        <div class="terms-content">${escapeHtml(job.jobDescription)}</div>
      </div>
      ` : ""}

      ${additionalTerms ? `
      <div class="terms-section">
        <div class="terms-title">Additional Terms & Conditions</div>
        <div class="terms-content">${injectFieldTags(escapeHtml(applyMergeTags(additionalTerms)))}</div>
      </div>
      ` : ""}

      <div class="terms-section">
        <div class="terms-title">Offer terms</div>
        <div class="details-section">
          ${!escapedIntro.includes('name="job_title"') ? `
          <div class="detail-row">
            <span class="detail-label">Position:</span>
            <span class="detail-value"><text-field name="job_title" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          ` : ""}
          ${!escapedIntro.includes('name="company_name"') ? `
          <div class="detail-row">
            <span class="detail-label">Company:</span>
            <span class="detail-value"><text-field name="company_name" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          ` : ""}
          <div class="detail-row">
            <span class="detail-label">Department:</span>
            <span class="detail-value"><text-field name="department" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Salary:</span>
            <span class="detail-value"><text-field name="salary" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Start Date:</span>
            <span class="detail-value"><text-field name="start_date" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Work Setup:</span>
            <span class="detail-value"><text-field name="work_setup" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Work Location:</span>
            <span class="detail-value"><text-field name="work_location" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Probation Days:</span>
            <span class="detail-value"><text-field name="probation_days" role="Candidate" readonly="true" style="display:inline-block;width:240px;height:22px;vertical-align:middle;border:none;background:transparent;font-size:inherit;font-family:inherit;"></text-field></span>
          </div>
        </div>
      </div>

        <div class="signature-section">
            <div class="signature-block">
                <div class="signature-role">Candidate Acceptance</div>
                <div class="signature-line">
                <strong>Candidate Name:</strong>
                <text-field name="candidate_name" role="Candidate" style="width: 200px; height: 24px;"></text-field>
                </div>
                <div class="signature-line">
                <strong>Signature:</strong>
                <signature-field name="signature" role="Candidate" style="width: 200px; height: 40px;"></signature-field>
                </div>
                <div class="signature-line">
                <strong>Date Signed:</strong>
                <date-field name="date_signed" role="Candidate" style="width: 150px; height: 24px;"></date-field>
                </div>
            </div>
          </div>
      </div>

      <div class="closing">${injectFieldTags(escapeHtml(applyMergeTags(DEFAULT_OFFER_CLOSING)))}</div>
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
  // If no additionalTerms provided, request a short AI-generated terms block
  let aiTerms = "";
  try {
    if (!settings?.additionalTerms) {
      aiTerms = await generateContractBody({
        job_title: job.jobTitle,
        location: job.location ?? "",
        salary: job.salary_min ?? job.salary_max ?? "",
      });
    }
  } catch (e) {
    console.warn("AI contract generation failed, falling back to static terms", e);
  }

  const mergedSettings = {
    ...(settings ?? {}),
    additionalTerms: settings?.additionalTerms || aiTerms || settings?.additionalTerms || "",
  } as OfferLetterSettings;

  const html = buildOfferLetterHtml(job, tenant, mergedSettings);
  const signingDeadlineDays = settings?.signingDeadlineDays ?? 7;
  const requireCountersignature = settings?.requireCountersignature ?? false;

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + signingDeadlineDays);

  const templateName = `${tenant.name} — ${job.jobTitle} Offer Letter`;

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
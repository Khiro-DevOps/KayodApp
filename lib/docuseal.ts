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
    submission?: {
      url?: string | null;
      combined_document_url?: string | null;
      audit_log_url?: string | null;
      status?: string | null;
      id?: number | null;
    };
    documents?: DocusealSubmissionDocument[];
    values?: Array<{ field?: string; value?: string }>;
  };
};

function getDocusealBaseUrl() {
  return (process.env.DOCUSEAL_BASE_URL?.trim() || "https://api.docuseal.com").replace(/\/$/, "");
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
  submissionName: string;
  submitterName: string;
  submitterEmail: string;
  externalId: string;
  redirectUrl?: string;
}) {
  const response = await fetchDocusealWithTimeout(`${getDocusealBaseUrl()}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": getDocusealApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: Number.parseInt(input.templateId, 10),
      send_email: true,
      submitters: [
        {
          role: "Candidate",
          name: input.submitterName,
          email: input.submitterEmail,
          external_id: input.externalId,
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

  return {
    submitterId: submitter.uuid ?? submitter.slug ?? null,
    signingUrl: submitter.embed_src,
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
  phInternetAllowance?: number;
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

We are pleased to extend an offer of employment to you for the position of [JOB_TITLE] at [COMPANY_NAME].

We believe you will be an excellent addition to our team, and we look forward to welcoming you on board.`;

const DEFAULT_OFFER_CLOSING = `Please review this offer carefully and sign below to indicate your acceptance.

We look forward to working with you!`;

/**
 * Build an HTML string for the offer letter that will be sent to DocuSeal
 */
export function buildOfferLetterHtml(
  job: JobOfferInput,
  tenant: TenantInfo,
  settings?: OfferLetterSettings
): string {
  const intro = settings?.introMessage || DEFAULT_OFFER_INTRO;
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
      <div class="intro-section">${escapeHtml(intro)}</div>

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
        <div class="terms-content">${escapeHtml(additionalTerms)}</div>
      </div>
      ` : ""}

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

      <div class="closing">${escapeHtml(DEFAULT_OFFER_CLOSING)}</div>
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
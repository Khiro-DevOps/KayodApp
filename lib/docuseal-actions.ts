"use server";

import {
  createJobOfferTemplate,
  getDocusealBaseUrl,
  REQUIRED_OFFER_TEMPLATE_FIELDS,
  type OfferLetterSettings,
} from "@/lib/docuseal";
import { getOrCreateContractTemplateId } from "@/lib/contract-template-compat";
import { getAdminClient } from "@/lib/supabase/admin";

type JobOfferRow = {
  id: string;
  latest_docuseal_url?: string | null;
  job_metadata?: Record<string, unknown> | null;
};

type DocusealSubmitterRecord = {
  id?: number;
  slug?: string | null;
  embed_src?: string | null;
  embed_token?: string | null;
  status?: string | null;
};

type DocusealResponsePayload =
  | DocusealSubmitterRecord
  | DocusealSubmitterRecord[]
  | {
      data?: DocusealSubmitterRecord[];
    };

const DOCUSEAL_REQUEST_TIMEOUT_MS = 8000;

function getDocusealApiUrl() {
  return getDocusealBaseUrl();
}

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

function getDocusealApiKey() {
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DOCUSEAL_API_KEY is not configured");
  }

  return apiKey;
}

function extractDocusealSlug(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  const slugMatch = url.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  if (slugMatch?.[1]) {
    return slugMatch[1];
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? null;
  } catch {
    return null;
  }
}

function normalizeEmbedSrc(raw: string | null | undefined, slug: string): string {
  if (!raw) {
    return `https://docuseal.com/s/${slug}`;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  const normalizedSlug = raw.replace(/^\/?(s\/)?/, "").split("?")[0].trim();
  return `https://docuseal.com/s/${normalizedSlug}`;
}

function readDocusealSubmitter(payload: DocusealResponsePayload): DocusealSubmitterRecord | null {
  if (Array.isArray(payload)) {
    return payload[0] ?? null;
  }

  if (payload && "data" in payload && Array.isArray(payload.data)) {
    return payload.data[0] ?? null;
  }

  return (payload as DocusealSubmitterRecord) ?? null;
}

async function fetchDocusealEmbedSrcForSlug(
  slug: string,
  jobOfferId: string
): Promise<string> {
  const apiKey = getDocusealApiKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const apiUrl = getDocusealApiUrl();
    const res = await fetch(`${apiUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
      method: "GET",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `DocuSeal submitter lookup failed for job offer ${jobOfferId}: ${res.status} ${res.statusText}`
      );
    }

    const payload = (await res.json()) as DocusealResponsePayload;
    const submitter = readDocusealSubmitter(payload);

    console.log("[DocuSeal] Submitter response:", {
      jobOfferId,
      slug,
      hasEmbedSrc: !!submitter?.embed_src,
      hasEmbedToken: !!submitter?.embed_token,
      status: submitter?.status,
    });

    const directEmbedSrc = submitter?.embed_src?.trim() || null;
    if (directEmbedSrc) {
      return directEmbedSrc;
    }

    if (submitter?.id) {
      const submissionRes = await fetchDocusealWithTimeout(
        `${apiUrl}/submissions/${submitter.id}`,
        {
          method: "GET",
          headers: {
            "X-Auth-Token": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (submissionRes.ok) {
        const submissionPayload = (await submissionRes.json()) as DocusealResponsePayload;
        const submissionSubmitter = readDocusealSubmitter(submissionPayload);
        const submissionEmbedSrc = submissionSubmitter?.embed_src?.trim() || null;

        if (submissionEmbedSrc) {
          return submissionEmbedSrc;
        }
      }

      const completedStatuses = ["completed", "declined", "expired"];
      const isRefreshable = !completedStatuses.includes(submitter?.status ?? "");

      if (isRefreshable) {
        // Request a fresh embed_src from DocuSeal
        const refreshRes = await fetchDocusealWithTimeout(
          `${apiUrl}/submitters/${submitter.id}`,
          {
            method: "PATCH",
            headers: {
              "X-Auth-Token": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ send_email: false }),
          }
        );

        if (!refreshRes.ok) {
          throw new Error(
            `DocuSeal submitter refresh failed for ${slug}: ${refreshRes.status} ${refreshRes.statusText}`
          );
        }

        const refreshed = (await refreshRes.json()) as DocusealResponsePayload;
        const refreshedSubmitter = readDocusealSubmitter(refreshed);
        const refreshedEmbedSrc = refreshedSubmitter?.embed_src?.trim() || null;

        if (refreshedEmbedSrc) {
          return refreshedEmbedSrc;
        }
      }
    }

    return normalizeEmbedSrc(null, submitter?.slug?.trim() || slug);

  } finally {
    clearTimeout(timeout);
  }
}

export async function getOrCreateDocusealEmbedSrc(jobOfferId: string): Promise<string> {
  const admin = getAdminClient();

  const { data: jobOffer, error } = await admin
    .from("job_offers")
    .select("id, latest_docuseal_url, job_metadata")
    .eq("id", jobOfferId)
    .maybeSingle<JobOfferRow>();

  if (error) {
    throw new Error(`Failed to load job offer ${jobOfferId}: ${error.message}`);
  }

  if (!jobOffer) {
    throw new Error(`Job offer ${jobOfferId} was not found`);
  }

  const metadata = (jobOffer.job_metadata ?? {}) as Record<string, unknown>;
  
  // Strip stale cached embed src so we always re-fetch and re-cache
  const cleanedMetadata = { ...metadata };
  delete cleanedMetadata.docuseal_embed_src;

  const slug = extractDocusealSlug(jobOffer.latest_docuseal_url);
  if (!slug) {
    throw new Error(`Job offer ${jobOfferId} does not have a DocuSeal submission URL to resolve an embed source`);
  }

  try {
    const embedSrc = await fetchDocusealEmbedSrcForSlug(slug, jobOfferId);

    const updatedMetadata = {
      ...cleanedMetadata,
      docuseal_embed_src: embedSrc,
    };

    const { error: updateError } = await admin
      .from("job_offers")
      .update({
        job_metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOfferId);

    if (updateError) {
      console.error("[DocuSeal] Failed to cache embed source on job offer", {
        jobOfferId,
        slug,
        status: updateError.message,
      });
      throw new Error(`DocuSeal embed source was fetched but could not be cached for job offer ${jobOfferId}: ${updateError.message}`);
    }

    return embedSrc;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DocuSeal] Unable to resolve embed source for job offer", {
      jobOfferId,
      slug,
      error: errorMessage,
    });
    throw error instanceof Error
      ? error
      : new Error(`Unable to resolve DocuSeal embed source for job offer ${jobOfferId}`);
  }
}

type DocusealTemplatePayload = {
  id?: string | number;
  archived_at?: string | null;
  archived?: boolean | null;
  fields?: Array<{ name?: string | null }>;
  submitters?: Array<{ fields?: Array<{ name?: string | null }> }>;
};

function extractTemplateFieldNames(template: DocusealTemplatePayload): Set<string> {
  const names = new Set<string>();
  if (Array.isArray(template.fields)) {
    for (const field of template.fields) {
      if (typeof field?.name === "string" && field.name.trim()) {
        names.add(field.name.trim());
      }
    }
  }
  if (Array.isArray(template.submitters)) {
    for (const submitter of template.submitters) {
      if (Array.isArray(submitter?.fields)) {
        for (const field of submitter.fields) {
          if (typeof field?.name === "string" && field.name.trim()) {
            names.add(field.name.trim());
          }
        }
      }
    }
  }
  return names;
}

export async function ensureOfferTemplate(jobId: string): Promise<string> {
  const admin = getAdminClient();

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select(
      "id, title, description, location, employment_type, work_setup, salary_min, salary_max, currency, job_category, offer_letter_settings, docuseal_template_id, created_by"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to load job posting ${jobId}: ${jobError?.message ?? "not found"}`);
  }

  const currentTemplateId = String(job.docuseal_template_id ?? "").trim();
  let isTemplateValid = false;

  if (currentTemplateId) {
    try {
      const res = await fetchDocusealWithTimeout(
        `${getDocusealBaseUrl()}/templates/${encodeURIComponent(currentTemplateId)}`,
        {
          method: "GET",
          headers: {
            "X-Auth-Token": getDocusealApiKey(),
          },
        }
      );

      if (res.ok && res.status !== 404) {
        const payload = (await res.json()) as DocusealTemplatePayload;
        const isArchived = Boolean(payload?.archived_at) || payload?.archived === true;
        const fieldNames = extractTemplateFieldNames(payload);
        const hasAllRequired = REQUIRED_OFFER_TEMPLATE_FIELDS.every((field) => fieldNames.has(field));

        if (!isArchived && hasAllRequired) {
          isTemplateValid = true;
        }
      }
    } catch {
      isTemplateValid = false;
    }
  }

  if (isTemplateValid && currentTemplateId) {
    if (job.created_by) {
      await getOrCreateContractTemplateId(admin, "contract_templates", {
        jobPostingId: job.id,
        docusealTemplateId: currentTemplateId,
        createdBy: job.created_by,
      });
    }
    return currentTemplateId;
  }

  const { data: creatorProfile } = job.created_by
    ? await admin
        .from("profiles")
        .select("first_name, last_name, email, tenant_id")
        .eq("id", job.created_by)
        .maybeSingle()
    : { data: null };

  const { data: tenantRow } = creatorProfile?.tenant_id
    ? await admin
        .from("tenants")
        .select("name")
        .eq("id", creatorProfile.tenant_id)
        .maybeSingle()
    : { data: null };

  const tenantName =
    tenantRow?.name?.trim() ||
    [creatorProfile?.first_name, creatorProfile?.last_name].filter(Boolean).join(" ").trim() ||
    "Company";

  const settings = (job.offer_letter_settings ?? undefined) as OfferLetterSettings | undefined;
  const newTemplateId = await createJobOfferTemplate(
    {
      jobTitle: job.title || "Position",
      department: settings?.phDepartment || job.job_category || undefined,
      employmentType: job.employment_type || "full_time",
      location: job.location || undefined,
      jobDescription: job.description || undefined,
      salary_min: job.salary_min ?? undefined,
      salary_max: job.salary_max ?? undefined,
      currency: job.currency || "PHP",
    },
    {
      name: tenantName,
      email: creatorProfile?.email ?? undefined,
    },
    settings
  );

  console.info("[DocuSeal] Replaced offer template for job", {
    jobId: job.id,
    replacedTemplateId: currentTemplateId || null,
    newTemplateId,
  });

  const { error: updateJobError } = await admin
    .from("job_postings")
    .update({ docuseal_template_id: newTemplateId })
    .eq("id", job.id);

  if (updateJobError) {
    throw new Error(`Failed to save new DocuSeal template ID on job posting: ${updateJobError.message}`);
  }

  if (job.created_by) {
    await getOrCreateContractTemplateId(admin, "contract_templates", {
      jobPostingId: job.id,
      docusealTemplateId: newTemplateId,
      createdBy: job.created_by,
    });
  }

  return newTemplateId;
}
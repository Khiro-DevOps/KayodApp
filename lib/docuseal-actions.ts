"use server";

import { getAdminClient } from "@/lib/supabase/admin";

type JobOfferRow = {
  id: string;
  latest_docuseal_url?: string | null;
  job_metadata?: Record<string, unknown> | null;
};

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

async function fetchDocusealEmbedSrcForSlug(
  slug: string,
  jobOfferId: string
): Promise<string> {
  const apiKey = getDocusealApiKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://api.docuseal.com/submitters?slug=${encodeURIComponent(slug)}`, {
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

    const payload = (await res.json()) as {
      id?: number;
      embed_src?: string | null;
      status?: string | null;
      data?: Array<{ id?: number; embed_src?: string | null; status?: string | null }>;
    };
    const submitter = payload.embed_src !== undefined ? payload : payload.data?.[0];

    console.log("[DocuSeal] Submitter response:", {
      jobOfferId,
      slug,
      hasEmbedSrc: !!submitter?.embed_src,
      status: submitter?.status,
    });

    if (!submitter?.embed_src) {
      const completedStatuses = ["completed", "declined", "expired"];
      const isRefreshable = submitter?.id && !completedStatuses.includes(submitter?.status ?? "");

      if (!isRefreshable) {
        throw new Error(
          `DocuSeal submitter ${slug} cannot be refreshed — status: ${submitter?.status}`
        );
      }

      // Request a fresh embed_src from DocuSeal
      const refreshRes = await fetchDocusealWithTimeout(
        `https://api.docuseal.com/submitters/${submitter.id}`,
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

      const refreshed = (await refreshRes.json()) as { embed_src?: string | null };
      if (!refreshed.embed_src) {
        throw new Error(
          `DocuSeal submitter ${slug} still has no embed_src after refresh`
        );
      }

      return refreshed.embed_src;
    }

    return submitter.embed_src as string;

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
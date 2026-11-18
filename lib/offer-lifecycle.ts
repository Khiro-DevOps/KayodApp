import "server-only";

import { getDocusealBaseUrl } from "@/lib/docuseal";
import { notifyJobCreator, sendNotification } from "@/lib/notifications";
import { getAdminClient } from "@/lib/supabase/admin";

export type OfferLifecycleSource =
  | "webhook"
  | "sign_route"
  | "offer_page_reconcile"
  | "applicants_page_reconcile"
  | "confirm_hire_reconcile"
  | string;

export interface OfferLifecycleInput {
  applicationId: string;
  offerId?: string | null;
  source: OfferLifecycleSource;
  signedAt?: string;
}

export interface OfferLifecycleResult {
  changed: boolean;
  offerId?: string | null;
  signedDocumentId?: string | null;
  error?: string;
}

type OfferRow = {
  id: string;
  application_id: string;
  status: string;
};

type ApplicationContext = {
  id: string;
  applicant_id: string | null;
  job_id: string | null;
  status: string | null;
  candidateName: string;
};

function formatCandidateName(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  const first = profile?.first_name?.trim() ?? "";
  const last = profile?.last_name?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ").trim() || "Candidate";
}

async function resolveOfferAndApplication(
  applicationId: string,
  offerId?: string | null,
): Promise<{
  offer: OfferRow | null;
  application: ApplicationContext | null;
  signedDocumentId: string | null;
  error?: string;
}> {
  const admin = getAdminClient();

  let offerQuery = admin
    .from("job_offers")
    .select("id, application_id, status");

  if (offerId) {
    offerQuery = offerQuery.eq("id", offerId);
  } else {
    offerQuery = offerQuery
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: offer, error: offerError } = await offerQuery.maybeSingle();
  if (offerError) {
    return {
      offer: null,
      application: null,
      signedDocumentId: null,
      error: offerError.message,
    };
  }

  const effectiveAppId = (offer as OfferRow | null)?.application_id ?? applicationId;

  const { data: appRow, error: appError } = await admin
    .from("job_applications")
    .select("id, applicant_id, job_id, status, profiles!job_applications_applicant_id_fkey(first_name, last_name)")
    .eq("id", effectiveAppId)
    .maybeSingle();

  if (appError) {
    return {
      offer: (offer as OfferRow | null) ?? null,
      application: null,
      signedDocumentId: null,
      error: appError.message,
    };
  }

  const { data: signedDocRow, error: signedDocError } = await admin
    .from("signed_documents")
    .select("id")
    .eq("application_id", effectiveAppId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (signedDocError) {
    return {
      offer: (offer as OfferRow | null) ?? null,
      application: null,
      signedDocumentId: null,
      error: signedDocError.message,
    };
  }

  const rawProfile = appRow
    ? (appRow as { profiles?: { first_name?: string | null; last_name?: string | null } | Array<{ first_name?: string | null; last_name?: string | null }> | null }).profiles
    : null;
  const profile = Array.isArray(rawProfile) ? rawProfile[0] ?? null : rawProfile;

  const application: ApplicationContext | null = appRow
    ? {
        id: (appRow as { id: string }).id,
        applicant_id: (appRow as { applicant_id: string | null }).applicant_id ?? null,
        job_id: (appRow as { job_id: string | null }).job_id ?? null,
        status: (appRow as { status: string | null }).status ?? null,
        candidateName: formatCandidateName(profile),
      }
    : null;

  return {
    offer: (offer as OfferRow | null) ?? null,
    application,
    signedDocumentId: (signedDocRow as { id: string } | null)?.id ?? null,
  };
}

/**
 * Verifies with DocuSeal API whether a submission is completed.
 */
export async function verifyDocusealSubmissionCompleted(
  submissionId: string | number | null | undefined,
): Promise<boolean> {
  if (!submissionId) {
    return false;
  }

  const apiKey = process.env.DOCUSEAL_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return false;
  }

  try {
    const res = await fetch(
      `${getDocusealBaseUrl()}/submissions/${encodeURIComponent(String(submissionId))}`,
      {
        headers: {
          "X-Auth-Token": apiKey,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    const status = typeof data?.status === "string" ? data.status.toLowerCase() : "";
    return status === "completed" || Boolean(data?.completed_at);
  } catch (err) {
    console.error("[offer-lifecycle] verifyDocusealSubmissionCompleted failed:", err);
    return false;
  }
}

/**
 * Idempotently marks an offer as SIGNED, updates signed_documents to 'signed',
 * sets job_applications.status = 'pre_employment' and contract_offer_id = signed_documents.id,
 * and sends candidate + HR notifications once when state transitions.
 */
export async function markOfferSigned({
  applicationId,
  offerId,
  source,
  signedAt,
}: OfferLifecycleInput): Promise<OfferLifecycleResult> {
  const admin = getAdminClient();
  const resolved = await resolveOfferAndApplication(applicationId, offerId);

  if (resolved.error) {
    return { changed: false, error: resolved.error };
  }

  const { offer, application, signedDocumentId } = resolved;
  if (!offer) {
    return { changed: false, error: "Job offer not found" };
  }

  const currentStatus = (offer.status ?? "").toUpperCase();
  if (["SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(currentStatus)) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  const now = new Date().toISOString();
  const effectiveSignedAt = signedAt ?? now;

  const { data: updatedOffers, error: offerUpdateError } = await admin
    .from("job_offers")
    .update({
      status: "SIGNED",
      updated_at: now,
    })
    .eq("id", offer.id)
    .neq("status", "SIGNED")
    .neq("status", "HIRED")
    .neq("status", "HIRE_CONFIRMED")
    .select("id");

  if (offerUpdateError) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
      error: offerUpdateError.message,
    };
  }

  if (!updatedOffers || updatedOffers.length === 0) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  if (signedDocumentId) {
    const { error: signedDocUpdateError } = await admin
      .from("signed_documents")
      .update({
        status: "signed",
        signed_at: effectiveSignedAt,
        updated_at: now,
      })
      .eq("id", signedDocumentId);

    if (signedDocUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: signedDocUpdateError.message,
      };
    }
  }

  if (application && application.status !== "hired") {
    const appUpdatePayload: Record<string, unknown> = {
      status: "pre_employment",
      updated_at: now,
    };
    if (signedDocumentId) {
      appUpdatePayload.contract_offer_id = signedDocumentId;
    }

    const { error: appUpdateError } = await admin
      .from("job_applications")
      .update(appUpdatePayload)
      .eq("id", application.id)
      .neq("status", "hired");

    if (appUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: appUpdateError.message,
      };
    }
  }

  if (application?.applicant_id) {
    await sendNotification({
      recipientId: application.applicant_id,
      type: "application_status_changed",
      title: "Contract signed",
      body: "Contract signed. HR will confirm your hire.",
      actionUrl: `/applicant/applications/${application.id}`,
      actionName: `offerLifecycle:${source}`,
    });
  }

  if (application?.job_id) {
    await notifyJobCreator({
      jobId: application.job_id,
      type: "application_status_changed",
      title: "Offer signed",
      body: `${application.candidateName} signed the offer. Confirm hire.`,
      link: "/hr/applicants",
    });
  }

  return {
    changed: true,
    offerId: offer.id,
    signedDocumentId,
  };
}

/**
 * Idempotently marks an offer as DECLINED, updates signed_documents to 'declined',
 * sets job_applications.status = 'offer_declined', and notifies HR once.
 */
export async function markOfferDeclined({
  applicationId,
  offerId,
}: OfferLifecycleInput): Promise<OfferLifecycleResult> {
  const admin = getAdminClient();
  const resolved = await resolveOfferAndApplication(applicationId, offerId);

  if (resolved.error) {
    return { changed: false, error: resolved.error };
  }

  const { offer, application, signedDocumentId } = resolved;
  if (!offer) {
    return { changed: false, error: "Job offer not found" };
  }

  const currentStatus = (offer.status ?? "").toUpperCase();
  if (["DECLINED", "SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(currentStatus)) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  const now = new Date().toISOString();

  const { data: updatedOffers, error: offerUpdateError } = await admin
    .from("job_offers")
    .update({
      status: "DECLINED",
      updated_at: now,
    })
    .eq("id", offer.id)
    .neq("status", "DECLINED")
    .neq("status", "SIGNED")
    .neq("status", "HIRED")
    .neq("status", "HIRE_CONFIRMED")
    .select("id");

  if (offerUpdateError) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
      error: offerUpdateError.message,
    };
  }

  if (!updatedOffers || updatedOffers.length === 0) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  if (signedDocumentId) {
    const { error: signedDocUpdateError } = await admin
      .from("signed_documents")
      .update({
        status: "declined",
        updated_at: now,
      })
      .eq("id", signedDocumentId);

    if (signedDocUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: signedDocUpdateError.message,
      };
    }
  }

  if (application && application.status !== "hired") {
    const { error: appUpdateError } = await admin
      .from("job_applications")
      .update({
        status: "offer_declined",
        updated_at: now,
      })
      .eq("id", application.id)
      .neq("status", "hired");

    if (appUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: appUpdateError.message,
      };
    }
  }

  if (application?.job_id) {
    await notifyJobCreator({
      jobId: application.job_id,
      type: "application_status_changed",
      title: "Offer declined",
      body: `${application.candidateName} declined the offer.`,
      link: "/hr/applicants",
    });
  }

  return {
    changed: true,
    offerId: offer.id,
    signedDocumentId,
  };
}

/**
 * Idempotently marks an offer as EXPIRED, updates signed_documents to 'expired',
 * sets job_applications.status = 'offer_expired', and notifies candidate + HR once.
 */
export async function markOfferExpired({
  applicationId,
  offerId,
  source,
}: OfferLifecycleInput): Promise<OfferLifecycleResult> {
  const admin = getAdminClient();
  const resolved = await resolveOfferAndApplication(applicationId, offerId);

  if (resolved.error) {
    return { changed: false, error: resolved.error };
  }

  const { offer, application, signedDocumentId } = resolved;
  if (!offer) {
    return { changed: false, error: "Job offer not found" };
  }

  const currentStatus = (offer.status ?? "").toUpperCase();
  if (["EXPIRED", "SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(currentStatus)) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  const now = new Date().toISOString();

  const { data: updatedOffers, error: offerUpdateError } = await admin
    .from("job_offers")
    .update({
      status: "EXPIRED",
      updated_at: now,
    })
    .eq("id", offer.id)
    .neq("status", "EXPIRED")
    .neq("status", "SIGNED")
    .neq("status", "HIRED")
    .neq("status", "HIRE_CONFIRMED")
    .select("id");

  if (offerUpdateError) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
      error: offerUpdateError.message,
    };
  }

  if (!updatedOffers || updatedOffers.length === 0) {
    return {
      changed: false,
      offerId: offer.id,
      signedDocumentId,
    };
  }

  if (signedDocumentId) {
    const { error: signedDocUpdateError } = await admin
      .from("signed_documents")
      .update({
        status: "expired",
        updated_at: now,
      })
      .eq("id", signedDocumentId);

    if (signedDocUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: signedDocUpdateError.message,
      };
    }
  }

  if (application && application.status !== "hired") {
    const { error: appUpdateError } = await admin
      .from("job_applications")
      .update({
        status: "offer_expired",
        updated_at: now,
      })
      .eq("id", application.id)
      .neq("status", "hired");

    if (appUpdateError) {
      return {
        changed: false,
        offerId: offer.id,
        signedDocumentId,
        error: appUpdateError.message,
      };
    }
  }

  if (application?.applicant_id) {
    await sendNotification({
      recipientId: application.applicant_id,
      type: "application_status_changed",
      title: "Offer expired",
      body: "Your job offer has expired.",
      actionUrl: `/applicant/applications/${application.id}`,
      actionName: `offerLifecycle:${source}`,
    });
  }

  if (application?.job_id) {
    await notifyJobCreator({
      jobId: application.job_id,
      type: "application_status_changed",
      title: "Offer expired",
      body: `Offer for ${application.candidateName} has expired.`,
      link: "/hr/applicants",
    });
  }

  return {
    changed: true,
    offerId: offer.id,
    signedDocumentId,
  };
}

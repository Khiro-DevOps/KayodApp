"use server";

import { revalidatePath } from "next/cache";
import {
  createHydratedOfferDraft,
  sendDraftOffer,
  updateOfferDraft,
} from "@/app/(auth)/actions/offer-actions";
import { getDocusealBaseUrl } from "@/lib/docuseal";
import {
  notifyJobCreator,
  notifyTenantOfferDecisionMakers,
  sendNotification,
} from "@/lib/notifications";
import { canHr } from "@/lib/rbac/permissions";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_NEGOTIATION_FIELDS = [
  "salary",
  "start_date",
  "work_setup",
  "probation_days",
  "other",
] as const;

export type NegotiationField = (typeof ALLOWED_NEGOTIATION_FIELDS)[number];
export type NegotiationDecision = "approved" | "rejected" | "countered";

export interface NegotiationItemInput {
  field: string;
  requestedValue: unknown;
  comment?: string | null;
}

export interface OfferNegotiationRow {
  id: string;
  offer_id: string | null;
  application_id: string;
  initiator_id: string | null;
  round: number;
  target_field: string;
  current_value: unknown;
  requested_value: unknown;
  comments: string | null;
  status: "pending" | "approved" | "countered" | "rejected";
  counter_value: unknown;
  hr_comment: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type ActionResult = {
  success: boolean;
  error?: string;
};

type ApplicationWithJob = {
  id: string;
  applicant_id: string;
  job_id: string;
  status: string;
  profiles?:
    | { first_name?: string | null; last_name?: string | null }
    | Array<{ first_name?: string | null; last_name?: string | null }>
    | null;
  job_postings?:
    | { id: string; title?: string | null; tenant_id?: string | null; created_by?: string | null }
    | Array<{ id: string; title?: string | null; tenant_id?: string | null; created_by?: string | null }>
    | null;
};

type ActiveOfferRecord = {
  id: string;
  application_id: string;
  job_id?: string | null;
  status: string;
  version_id?: number | null;
  is_active?: boolean | null;
  salary?: number | null;
  start_date?: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  work_days?: string[] | null;
  department?: string | null;
  probation_days?: number | null;
  latest_docuseal_url?: string | null;
  docuseal_submission_id?: string | null;
  job_metadata?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function toSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

function isAllowedNegotiationField(field: string): field is NegotiationField {
  return (ALLOWED_NEGOTIATION_FIELDS as readonly string[]).includes(field);
}

function extractNegotiationPrimitive(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if ("value" in obj) return obj.value;
    if ("counterSalary" in obj) return obj.counterSalary;
    if ("question" in obj) return obj.question;
  }
  return raw;
}

function getOfferFieldValue(offer: ActiveOfferRecord, field: NegotiationField): unknown {
  const meta = (offer.job_metadata ?? offer.metadata ?? {}) as Record<string, unknown>;
  switch (field) {
    case "salary":
      return offer.salary ?? null;
    case "start_date":
      return offer.start_date ?? (typeof meta.start_date === "string" ? meta.start_date : null);
    case "work_setup":
      return offer.work_setup ?? offer.work_mode ?? null;
    case "probation_days":
      return offer.probation_days ?? null;
    case "other":
      return meta.other ?? null;
  }
}

async function verifyHrAndTenant(
  applicationId: string
): Promise<
  | {
      ok: true;
      userId: string;
      application: ApplicationWithJob;
      jobPosting: { id: string; title?: string | null; tenant_id?: string | null; created_by?: string | null };
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = getAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, hr_role, is_tenant_owner, tenant_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: profileError?.message ?? "Profile not found" };
  }

  if (!["hr_manager", "admin", "hr"].includes(String(profile.role ?? ""))) {
    return { ok: false, error: "Forbidden: HR role required" };
  }

  if (!canHr(profile.hr_role, "offers:approve_and_send", profile.is_tenant_owner)) {
    return {
      ok: false,
      error: "Forbidden: Only HR Admin or HR Generalist can approve, counter, or decline offer negotiations.",
    };
  }

  const { data: appRow, error: appError } = await admin
    .from("job_applications")
    .select(
      "id, applicant_id, job_id, status, profiles!job_applications_applicant_id_fkey(first_name, last_name), job_postings!job_applications_job_id_fkey(id, title, tenant_id, created_by)"
    )
    .eq("id", applicationId)
    .single();

  if (appError || !appRow) {
    return { ok: false, error: appError?.message ?? "Application not found" };
  }

  const typedApp = appRow as unknown as ApplicationWithJob;
  const jobPosting = toSingle(typedApp.job_postings);
  if (!jobPosting) {
    return { ok: false, error: "Job posting not found" };
  }

  let jobTenantId = jobPosting.tenant_id ?? null;
  if (!jobTenantId && jobPosting.created_by) {
    const { data: creatorProfile, error: creatorError } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", jobPosting.created_by)
      .maybeSingle();

    if (creatorError) {
      return { ok: false, error: creatorError.message };
    }
    jobTenantId = creatorProfile?.tenant_id ?? null;
  }

  if (profile.tenant_id && jobTenantId && profile.tenant_id !== jobTenantId) {
    return { ok: false, error: "Forbidden: tenant mismatch" };
  }

  return {
    ok: true,
    userId: user.id,
    application: typedApp,
    jobPosting,
  };
}

function extractDocusealSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

async function archiveDocusealSubmissionBestEffort(offer: ActiveOfferRecord): Promise<void> {
  try {
    const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (!apiKey) return;

    const baseUrl = getDocusealBaseUrl();
    let submissionId: string | number | null = offer.docuseal_submission_id?.trim() || null;

    if (!submissionId && offer.latest_docuseal_url) {
      const slug = extractDocusealSlug(offer.latest_docuseal_url);
      if (slug) {
        const subRes = await fetch(`${baseUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
          method: "GET",
          headers: {
            "X-Auth-Token": apiKey,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (subRes.ok) {
          const payload = (await subRes.json()) as
            | { data?: Array<{ submission_id?: number; id?: number }> }
            | Array<{ submission_id?: number; id?: number }>;
          const list = Array.isArray(payload) ? payload : payload?.data ?? [];
          const first = list[0];
          submissionId = first?.submission_id ?? first?.id ?? null;
        } else {
          console.error(
            "[sendRevisedOffer] Failed to look up DocuSeal submitter for archive:",
            subRes.status,
            subRes.statusText
          );
        }
      }
    }

    if (!submissionId) return;

    const archiveRes = await fetch(
      `${baseUrl}/submissions/${encodeURIComponent(String(submissionId))}`,
      {
        method: "DELETE",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!archiveRes.ok) {
      console.error(
        "[sendRevisedOffer] DocuSeal submission archive returned non-OK:",
        archiveRes.status,
        archiveRes.statusText
      );
    }
  } catch (err) {
    console.error("[sendRevisedOffer] Failed to archive old DocuSeal submission:", err);
  }
}

export async function submitOfferNegotiation(
  applicationId: string,
  items: NegotiationItemInput[]
): Promise<ActionResult> {
  try {
    if (!applicationId || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: "At least one negotiation item is required" };
    }

    for (const item of items) {
      if (!item || typeof item.field !== "string" || !isAllowedNegotiationField(item.field)) {
        return {
          success: false,
          error: `Invalid negotiation field: ${String(item?.field ?? "")}`,
        };
      }
      const rawVal = item.requestedValue;
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") {
        return {
          success: false,
          error: `Requested value is required for ${item.field}`,
        };
      }
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const admin = getAdminClient();

    const { data: applicationRow, error: applicationError } = await admin
      .from("job_applications")
      .select(
        "id, applicant_id, job_id, status, profiles!job_applications_applicant_id_fkey(first_name, last_name), job_postings!job_applications_job_id_fkey(id, title, created_by)"
      )
      .eq("id", applicationId)
      .single();

    if (applicationError || !applicationRow) {
      return { success: false, error: applicationError?.message ?? "Application not found" };
    }

    const typedApplication = applicationRow as unknown as ApplicationWithJob;
    if (typedApplication.applicant_id !== user.id) {
      return { success: false, error: "Forbidden: only the applicant can request offer changes" };
    }

    const { data: activeOffer, error: offerError } = await admin
      .from("job_offers")
      .select(
        "id, application_id, job_id, status, version_id, is_active, salary, start_date, work_setup, work_mode, probation_days, job_metadata, metadata"
      )
      .eq("application_id", applicationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<ActiveOfferRecord>();

    if (offerError) {
      return { success: false, error: offerError.message };
    }

    if (!activeOffer || String(activeOffer.status ?? "").toUpperCase() !== "SENT") {
      return { success: false, error: "Active offer must be in SENT status to negotiate" };
    }

    const { data: pendingRows, error: pendingError } = await admin
      .from("job_offer_negotiations")
      .select("id")
      .eq("application_id", applicationId)
      .eq("status", "pending")
      .limit(1);

    if (pendingError) {
      return { success: false, error: pendingError.message };
    }

    if (pendingRows && pendingRows.length > 0) {
      return { success: false, error: "A pending negotiation round already exists" };
    }

    const { data: maxRoundRow, error: maxRoundError } = await admin
      .from("job_offer_negotiations")
      .select("round")
      .eq("application_id", applicationId)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle<{ round: number | null }>();

    if (maxRoundError) {
      return { success: false, error: maxRoundError.message };
    }

    const nextRound = (maxRoundRow?.round ?? 0) + 1;

    const rowsToInsert = items.map((item) => {
      const field = item.field as NegotiationField;
      return {
        offer_id: activeOffer.id,
        application_id: applicationId,
        initiator_id: user.id,
        round: nextRound,
        target_field: field,
        current_value: getOfferFieldValue(activeOffer, field),
        requested_value: item.requestedValue,
        comments: item.comment?.trim() || null,
        status: "pending" as const,
      };
    });

    const { error: insertError } = await admin
      .from("job_offer_negotiations")
      .insert(rowsToInsert);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    const nowIso = new Date().toISOString();

    const { error: updateOfferError } = await admin
      .from("job_offers")
      .update({
        status: "NEGOTIATING",
        updated_at: nowIso,
      })
      .eq("id", activeOffer.id);

    if (updateOfferError) {
      return { success: false, error: updateOfferError.message };
    }

    const { error: updateAppError } = await admin
      .from("job_applications")
      .update({
        status: "negotiating",
        updated_at: nowIso,
      })
      .eq("id", applicationId);

    if (updateAppError) {
      return { success: false, error: updateAppError.message };
    }

    const applicantProfile = toSingle(typedApplication.profiles);
    const candidateName =
      [applicantProfile?.first_name?.trim(), applicantProfile?.last_name?.trim()]
        .filter(Boolean)
        .join(" ")
        .trim() || "The candidate";
    const jobPosting = toSingle(typedApplication.job_postings);
    const jobTitle = jobPosting?.title?.trim() || "position";

    let resolvedTenantId = jobPosting?.tenant_id ?? null;
    if (!resolvedTenantId && jobPosting?.created_by) {
      const { data: creatorProfile } = await admin
        .from("profiles")
        .select("tenant_id")
        .eq("id", jobPosting.created_by)
        .maybeSingle();
      resolvedTenantId = creatorProfile?.tenant_id ?? null;
    }

    const notifiedDecisionMakers = await notifyTenantOfferDecisionMakers({
      tenantId: resolvedTenantId,
      type: "offer_letter",
      title: `Action Required: Offer Negotiation / Salary Review for ${candidateName}`,
      body: `${candidateName} submitted a counter-offer / negotiation request for ${jobTitle}.`,
      actionUrl: `/hr/offers/${activeOffer.id}`,
      senderId: user.id,
      actionName: "submitOfferNegotiation",
    });

    if (!jobPosting?.created_by || !notifiedDecisionMakers.includes(jobPosting.created_by)) {
      await notifyJobCreator({
        jobId: typedApplication.job_id,
        type: "offer_letter",
        title: `Action Required: Offer Negotiation / Salary Review for ${candidateName}`,
        body: `${candidateName} requested changes to the job offer for ${jobTitle}.`,
        link: `/hr/offers/${activeOffer.id}`,
        senderId: user.id,
      });
    }

    revalidatePath(`/applicant/applications/${applicationId}`);
    revalidatePath(`/applicant/offer/${applicationId}`);
    revalidatePath(`/applicant/offer/${applicationId}/sign`);
    revalidatePath(`/hr/offers/${applicationId}`);
    revalidatePath(`/job-offer/${applicationId}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit offer negotiation",
    };
  }
}

function applyNegotiatedTermToOffer(
  offer: ActiveOfferRecord & { financial_package?: Record<string, unknown> | null },
  targetField: string,
  rawVal: unknown
): Record<string, unknown> | null {
  if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") {
    return null;
  }

  const existingMeta = {
    ...((offer.job_metadata ?? offer.metadata ?? {}) as Record<string, unknown>),
  };
  const existingPkg = {
    ...((offer.financial_package ?? {}) as Record<string, unknown>),
  };

  const updates: Record<string, unknown> = {};

  switch (targetField) {
    case "salary": {
      const parsedSalary = Number(String(rawVal).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(parsedSalary) || parsedSalary <= 0) return null;
      updates.salary = parsedSalary;
      existingPkg.offered_salary = parsedSalary;
      existingMeta.base_salary = parsedSalary;
      updates.financial_package = existingPkg;
      updates.job_metadata = existingMeta;
      return updates;
    }
    case "allowance":
    case "allowances":
    case "monthly_allowance": {
      const parsedAllowance = Number(String(rawVal).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(parsedAllowance) || parsedAllowance < 0) return null;
      existingPkg.monthly_allowance = parsedAllowance;
      existingMeta.monthly_allowance = parsedAllowance;
      updates.financial_package = existingPkg;
      updates.job_metadata = existingMeta;
      return updates;
    }
    case "start_date": {
      const nextStartDate = String(rawVal).trim();
      updates.start_date = nextStartDate;
      existingMeta.start_date = nextStartDate;
      existingMeta.expected_start_date = nextStartDate;
      updates.job_metadata = existingMeta;
      return updates;
    }
    case "work_setup": {
      const nextSetup = String(rawVal).trim();
      updates.work_setup = nextSetup;
      updates.work_mode = nextSetup.toLowerCase();
      return updates;
    }
    case "probation_days": {
      const parsedDays = Number.parseInt(String(rawVal).replace(/[^0-9-]/g, ""), 10);
      if (!Number.isFinite(parsedDays) || parsedDays < 0) return null;
      updates.probation_days = parsedDays;
      return updates;
    }
    case "other": {
      existingMeta.other = rawVal;
      updates.job_metadata = existingMeta;
      return updates;
    }
    default:
      return null;
  }
}

export async function respondToNegotiation(
  negotiationId: string,
  decision: "approved" | "rejected" | "countered",
  counterValue?: unknown,
  comment?: string
): Promise<ActionResult> {
  try {
    if (!negotiationId) {
      return { success: false, error: "Negotiation ID is required" };
    }

    if (!["approved", "rejected", "countered"].includes(decision)) {
      return { success: false, error: "Invalid negotiation decision" };
    }

    if (
      decision === "countered" &&
      (counterValue === null || counterValue === undefined || String(counterValue).trim() === "")
    ) {
      return { success: false, error: "Counter value is required when countering" };
    }

    const admin = getAdminClient();

    const { data: negotiationRow, error: negotiationError } = await admin
      .from("job_offer_negotiations")
      .select("id, application_id, offer_id, round, status, target_field, requested_value")
      .eq("id", negotiationId)
      .single();

    if (negotiationError || !negotiationRow) {
      return { success: false, error: negotiationError?.message ?? "Negotiation request not found" };
    }

    const authCheck = await verifyHrAndTenant(negotiationRow.application_id);
    if (!authCheck.ok) {
      return { success: false, error: authCheck.error };
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await admin
      .from("job_offer_negotiations")
      .update({
        status: decision,
        counter_value: decision === "countered" ? counterValue ?? null : null,
        hr_comment: comment?.trim() || null,
        resolved_by: authCheck.userId,
        resolved_at: nowIso,
      })
      .eq("id", negotiationId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Immediately persist approved or countered terms back onto the active job_offers record
    let resolvedOfferId: string | null = negotiationRow.offer_id ?? null;
    if (decision === "approved" || decision === "countered") {
      const agreedRawValue =
        decision === "approved"
          ? extractNegotiationPrimitive(negotiationRow.requested_value)
          : extractNegotiationPrimitive(counterValue);

      let offerQuery = admin
        .from("job_offers")
        .select(
          "id, application_id, job_id, status, version_id, is_active, salary, start_date, work_setup, work_mode, work_location_id, shift_start, shift_end, work_days, department, probation_days, financial_package, job_metadata, metadata"
        );
      if (negotiationRow.offer_id) {
        offerQuery = offerQuery.eq("id", negotiationRow.offer_id);
      } else {
        offerQuery = offerQuery
          .eq("application_id", negotiationRow.application_id)
          .order("is_active", { ascending: false })
          .order("version_id", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1);
      }

      const { data: activeOffer } = await offerQuery.maybeSingle<
        ActiveOfferRecord & { financial_package?: Record<string, unknown> | null }
      >();

      if (activeOffer) {
        resolvedOfferId = activeOffer.id;
        const offerUpdates = applyNegotiatedTermToOffer(
          activeOffer,
          negotiationRow.target_field,
          agreedRawValue
        );
        if (offerUpdates) {
          const { error: offerSyncError } = await admin
            .from("job_offers")
            .update({
              ...offerUpdates,
              updated_at: nowIso,
            })
            .eq("id", activeOffer.id);

          if (offerSyncError) {
            return { success: false, error: offerSyncError.message };
          }
        }
      }
    }

    const { data: remainingPending, error: remainingError } = await admin
      .from("job_offer_negotiations")
      .select("id")
      .eq("application_id", negotiationRow.application_id)
      .eq("round", negotiationRow.round ?? 1)
      .eq("status", "pending")
      .limit(1);

    if (remainingError) {
      return { success: false, error: remainingError.message };
    }

    if (
      negotiationRow.status === "pending" &&
      (!remainingPending || remainingPending.length === 0)
    ) {
      const jobTitle = authCheck.jobPosting.title?.trim() || "position";
      await sendNotification({
        recipientId: authCheck.application.applicant_id,
        type: "application_status_changed",
        title: `Offer Negotiation Response for ${jobTitle}`,
        body: "HR has responded to your offer change requests.",
        actionUrl: `/applicant/offer/${negotiationRow.application_id}`,
        senderId: authCheck.userId,
        actionName: "respondToNegotiation",
      });
    }

    if (resolvedOfferId) {
      revalidatePath(`/hr/offers/${resolvedOfferId}`);
      revalidatePath(`/applicant/offer/${resolvedOfferId}`);
      revalidatePath(`/job-offer/${resolvedOfferId}`);
    }
    revalidatePath(`/hr/offers/${negotiationRow.application_id}`);
    revalidatePath(`/applicant/applications/${negotiationRow.application_id}`);
    revalidatePath(`/applicant/offer/${negotiationRow.application_id}`);
    revalidatePath(`/applicant/offer/${negotiationRow.application_id}/sign`);
    revalidatePath(`/job-offer/${negotiationRow.application_id}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to respond to negotiation",
    };
  }
}

export async function acceptCounterOffer(negotiationId: string): Promise<ActionResult> {
  try {
    if (!negotiationId) {
      return { success: false, error: "Negotiation ID is required" };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const admin = getAdminClient();
    const { data: negotiationRow, error: negErr } = await admin
      .from("job_offer_negotiations")
      .select("id, application_id, offer_id, status, target_field, counter_value")
      .eq("id", negotiationId)
      .single();

    if (negErr || !negotiationRow) {
      return { success: false, error: negErr?.message ?? "Counter-offer not found" };
    }

    if (negotiationRow.status !== "countered") {
      return { success: false, error: "Only countered requests can be accepted" };
    }

    const { data: appRow } = await admin
      .from("job_applications")
      .select("id, applicant_id")
      .eq("id", negotiationRow.application_id)
      .maybeSingle();

    if (!appRow || appRow.applicant_id !== user.id) {
      return { success: false, error: "Forbidden: You do not own this application" };
    }

    const nowIso = new Date().toISOString();

    let offerQuery = admin
      .from("job_offers")
      .select(
        "id, application_id, job_id, status, version_id, is_active, salary, start_date, work_setup, work_mode, work_location_id, shift_start, shift_end, work_days, department, probation_days, financial_package, job_metadata, metadata"
      );
    if (negotiationRow.offer_id) {
      offerQuery = offerQuery.eq("id", negotiationRow.offer_id);
    } else {
      offerQuery = offerQuery
        .eq("application_id", negotiationRow.application_id)
        .order("is_active", { ascending: false })
        .order("version_id", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);
    }

    const { data: activeOffer } = await offerQuery.maybeSingle<
      ActiveOfferRecord & { financial_package?: Record<string, unknown> | null }
    >();

    if (!activeOffer) {
      return { success: false, error: "Active job offer not found" };
    }

    const offerUpdates = applyNegotiatedTermToOffer(
      activeOffer,
      negotiationRow.target_field,
      extractNegotiationPrimitive(negotiationRow.counter_value)
    );

    if (offerUpdates) {
      const { error: offerUpdateError } = await admin
        .from("job_offers")
        .update({
          ...offerUpdates,
          updated_at: nowIso,
        })
        .eq("id", activeOffer.id);

      if (offerUpdateError) {
        return { success: false, error: offerUpdateError.message };
      }
    }

    await admin
      .from("job_offer_negotiations")
      .update({
        status: "approved",
        resolved_at: nowIso,
      })
      .eq("id", negotiationId);

    revalidatePath(`/hr/offers/${activeOffer.id}`);
    revalidatePath(`/hr/offers/${negotiationRow.application_id}`);
    revalidatePath(`/applicant/offer/${activeOffer.id}`);
    revalidatePath(`/applicant/offer/${negotiationRow.application_id}`);
    revalidatePath(`/applicant/offer/${negotiationRow.application_id}/sign`);
    revalidatePath(`/applicant/applications/${negotiationRow.application_id}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to accept counter-offer",
    };
  }
}

export async function sendRevisedOffer(applicationId: string): Promise<ActionResult> {
  try {
    if (!applicationId) {
      return { success: false, error: "Application ID is required" };
    }

    const authCheck = await verifyHrAndTenant(applicationId);
    if (!authCheck.ok) {
      return { success: false, error: authCheck.error };
    }

    const admin = getAdminClient();

    const { data: currentOffer, error: offerError } = await admin
      .from("job_offers")
      .select(
        "id, application_id, job_id, status, version_id, is_active, salary, start_date, work_setup, work_mode, work_location_id, shift_start, shift_end, work_days, department, probation_days, latest_docuseal_url, docuseal_submission_id, financial_package, job_metadata, metadata"
      )
      .eq("application_id", applicationId)
      .order("is_active", { ascending: false })
      .order("version_id", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<ActiveOfferRecord & { financial_package?: Record<string, unknown> | null }>();

    if (offerError) {
      return { success: false, error: offerError.message };
    }

    if (!currentOffer) {
      return { success: false, error: "Current offer not found" };
    }

    const { data: negotiations, error: negotiationsError } = await admin
      .from("job_offer_negotiations")
      .select(
        "id, offer_id, application_id, initiator_id, round, target_field, current_value, requested_value, comments, status, counter_value, hr_comment, resolved_by, created_at, resolved_at"
      )
      .eq("application_id", applicationId)
      .order("round", { ascending: true })
      .order("created_at", { ascending: true });

    if (negotiationsError) {
      return { success: false, error: negotiationsError.message };
    }

    const allNegotiations = (negotiations ?? []) as OfferNegotiationRow[];
    if (allNegotiations.some((row) => row.status === "pending")) {
      return {
        success: false,
        error: "All pending negotiation requests must be resolved before sending a revised offer",
      };
    }

    const maxRound = allNegotiations.reduce((max, row) => Math.max(max, row.round ?? 1), 0);
    const activeRoundRows = allNegotiations.filter((row) => (row.round ?? 1) === maxRound);

    const existingMeta = {
      ...((currentOffer.job_metadata ?? currentOffer.metadata ?? {}) as Record<string, unknown>),
    };
    delete existingMeta.docuseal_embed_src;

    const existingPkg = {
      ...((currentOffer.financial_package ?? {}) as Record<string, unknown>),
    };

    const newTerms: Record<string, unknown> = {
      salary: currentOffer.salary ?? 0,
      start_date: currentOffer.start_date ?? null,
      work_setup: currentOffer.work_setup ?? currentOffer.work_mode ?? "Remote",
      work_mode:
        currentOffer.work_mode ??
        (currentOffer.work_setup ? String(currentOffer.work_setup).toLowerCase() : "remote"),
      work_location_id: currentOffer.work_location_id ?? null,
      shift_start: currentOffer.shift_start ?? null,
      shift_end: currentOffer.shift_end ?? null,
      work_days: currentOffer.work_days ?? null,
      department: currentOffer.department ?? null,
      probation_days: currentOffer.probation_days ?? 180,
      financial_package: existingPkg,
      job_metadata: existingMeta,
    };

    for (const row of activeRoundRows) {
      if (row.status !== "approved" && row.status !== "countered") {
        continue;
      }

      const rawVal =
        row.status === "approved"
          ? extractNegotiationPrimitive(row.requested_value)
          : extractNegotiationPrimitive(row.counter_value);

      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") {
        continue;
      }

      switch (row.target_field) {
        case "salary": {
          const parsedSalary = Number(String(rawVal).replace(/[^0-9.-]/g, ""));
          if (Number.isFinite(parsedSalary)) {
            newTerms.salary = parsedSalary;
            existingPkg.offered_salary = parsedSalary;
            existingMeta.base_salary = parsedSalary;
          }
          break;
        }
        case "start_date": {
          const nextStartDate = String(rawVal).trim();
          newTerms.start_date = nextStartDate;
          existingMeta.start_date = nextStartDate;
          break;
        }
        case "work_setup": {
          const nextSetup = String(rawVal).trim();
          newTerms.work_setup = nextSetup;
          newTerms.work_mode = nextSetup.toLowerCase();
          break;
        }
        case "probation_days": {
          const parsedDays = Number.parseInt(String(rawVal).replace(/[^0-9-]/g, ""), 10);
          if (Number.isFinite(parsedDays)) {
            newTerms.probation_days = parsedDays;
          }
          break;
        }
        case "other": {
          existingMeta.other = rawVal;
          break;
        }
      }
    }

    const resolvedJobId = currentOffer.job_id ?? authCheck.application.job_id;

    // 1. Create the revised offer draft (versions + 1, archives previous row, links parent_offer_id)
    const draftResult = await createHydratedOfferDraft(resolvedJobId, applicationId);
    if (!draftResult.success || !draftResult.offer) {
      return {
        success: false,
        error: draftResult.error ?? "Failed to create revised offer draft",
      };
    }

    const revisedOfferId = draftResult.offer.id as string;

    // 2. Mark previous row REVISED and is_active false
    const { error: markRevisedError } = await admin
      .from("job_offers")
      .update({
        status: "REVISED",
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentOffer.id);

    if (markRevisedError) {
      return { success: false, error: markRevisedError.message };
    }

    // 3. Update revised draft with merged terms
    const updateResult = await updateOfferDraft(revisedOfferId, newTerms);
    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error ?? "Failed to update revised offer draft",
      };
    }

    // 4. Send revised draft offer (triggers SENT notification once via DB trigger)
    const sendResult = await sendDraftOffer(resolvedJobId, applicationId, revisedOfferId);
    if (!sendResult.success) {
      return {
        success: false,
        error: sendResult.error ?? "Failed to send revised offer",
      };
    }

    // 5. Ensure job_applications.status is 'offer_sent'
    const { error: appStatusError } = await admin
      .from("job_applications")
      .update({
        status: "offer_sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (appStatusError) {
      return { success: false, error: appStatusError.message };
    }

    // 6. Best-effort archive of old DocuSeal submission (logs errors, never fails)
    await archiveDocusealSubmissionBestEffort(currentOffer);

    revalidatePath(`/hr/offers/${revisedOfferId}`);
    revalidatePath(`/hr/offers/${applicationId}`);
    revalidatePath(`/applicant/applications/${applicationId}`);
    revalidatePath(`/applicant/offer/${revisedOfferId}`);
    revalidatePath(`/applicant/offer/${applicationId}`);
    revalidatePath(`/applicant/offer/${applicationId}/sign`);
    revalidatePath(`/job-offer/${revisedOfferId}`);
    revalidatePath(`/job-offer/${applicationId}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send revised offer",
    };
  }
}

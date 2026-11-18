import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getContractBucketName } from "@/lib/supabase/storage";
import { downloadDocusealDocument, normalizeDocusealWebhook } from "@/lib/docuseal";
import { verifyDocusealSignature } from "@/lib/docuseal-webhook";
import {
  markOfferDeclined,
  markOfferExpired,
  markOfferSigned,
} from "@/lib/offer-lifecycle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-docuseal-signature") ?? "";

  const verification = verifyDocusealSignature(rawBody, signatureHeader);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch (err) {
    console.error("[DocuSeal Webhook] Invalid JSON payload:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = normalizeDocusealWebhook(rawPayload);
  const eventType = payload.event_type ?? "";
  const externalId = payload.data?.external_id ?? null;

  console.log(`[DocuSeal Webhook] Received event: ${eventType}, external_id: ${externalId}`);

  if (!externalId) {
    console.warn("[DocuSeal Webhook] external_id is missing");
    return NextResponse.json({ error: "external_id is required" }, { status: 400 });
  }

  const admin = getAdminClient();

  // Look up in signed_documents first
  const { data: signedDocument, error: signedDocumentError } = await admin
    .from("signed_documents")
    .select(`
      id,
      application_id,
      contract_template_id,
      signing_method,
      docuseal_submitter_id,
      docuseal_submission_url, 
      pdf_download_token,
      pdf_file_path,
      status,
      metadata,
      job_applications (
        id,
        applicant_id,
        job_id,
        status,
        profiles!job_applications_applicant_id_fkey (
          first_name,
          last_name,
          email
        ),
        job_postings!job_applications_job_id_fkey (
          created_by,
          title
        )
      )
    `)
    .eq("id", externalId)
    .maybeSingle();

  // Look up in job_offers
  const { data: jobOffer, error: jobOfferError } = signedDocument
    ? { data: null, error: null }
    : await admin
        .from("job_offers")
        .select(`
          id,
          application_id,
          status,
          latest_docuseal_url,
          docuseal_submission_id,
          updated_at,
          metadata,
          job_applications (
            id,
            applicant_id,
            job_id,
            status,
            profiles!job_applications_applicant_id_fkey (
              first_name,
              last_name,
              email
            ),
            job_postings!job_applications_job_id_fkey (
              created_by,
              title
            )
          )
        `)
        .eq("id", externalId)
        .maybeSingle();

  // Also resolve linked job_offer if signedDocument was found
  let linkedJobOffer = jobOffer;
  if (signedDocument && !linkedJobOffer) {
    const { data: linkedOffer } = await admin
      .from("job_offers")
      .select("id, application_id, status, latest_docuseal_url, updated_at")
      .eq("application_id", signedDocument.application_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    linkedJobOffer = linkedOffer as typeof jobOffer;
  }

  if (signedDocumentError && jobOfferError) {
    console.error("[DocuSeal Webhook] Failed to resolve offer by external_id:", {
      externalId,
      signedDocumentError: signedDocumentError.message,
      jobOfferError: jobOfferError?.message,
    });
  }

  if (!signedDocument && !jobOffer) {
    console.warn(`[DocuSeal Webhook] Offer not found for submission ${externalId}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const applicationId = signedDocument?.application_id ?? jobOffer?.application_id ?? null;

  if (!applicationId) {
    console.warn(`[DocuSeal Webhook] Application ID missing for submission ${externalId}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (eventType === "form.completed" || eventType === "submission.completed") {
    const offerToUpdate = jobOffer ?? linkedJobOffer;
    const currentOfferStatus = (offerToUpdate?.status ?? "").toUpperCase();
    if (
      signedDocument?.status === "signed" ||
      ["SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(currentOfferStatus)
    ) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const documents = payload.data?.documents ?? payload.data?.submission?.documents ?? [];
    const signedPdfUrl =
      documents[0]?.url ??
      payload.data?.submission?.combined_document_url ??
      payload.data?.combined_document_url ??
      payload.data?.submission?.url ??
      null;

    if (!signedPdfUrl) {
      return NextResponse.json({ error: "Signed PDF URL missing" }, { status: 400 });
    }

    const signedPdfBytes = await downloadDocusealDocument(signedPdfUrl);
    const contractBucket = getContractBucketName();
    const storagePath = `${applicationId}/${signedDocument?.id ?? jobOffer?.id}/signed-contract.pdf`;

    const { error: uploadError } = await admin.storage
      .from(contractBucket)
      .upload(storagePath, signedPdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[DocuSeal Webhook] Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    if (signedDocument) {
      const { error: updateDocumentError } = await admin
        .from("signed_documents")
        .update({
          pdf_file_path: storagePath,
          docuseal_submission_url: payload.data?.submission?.url ?? signedDocument.docuseal_submission_url,
          docuseal_submitter_id: signedDocument.docuseal_submitter_id ?? externalId,
          metadata: {
            ...(signedDocument.metadata ?? {}),
            docuseal_event: payload.event_type,
            docuseal_submission_id: payload.data?.submission?.id ?? null,
            docuseal_audit_log_url: payload.data?.submission?.audit_log_url ?? payload.data?.audit_log_url ?? null,
            docuseal_combined_document_url: payload.data?.submission?.combined_document_url ?? payload.data?.combined_document_url ?? null,
          },
        })
        .eq("id", signedDocument.id);

      if (updateDocumentError) {
        return NextResponse.json({ error: updateDocumentError.message }, { status: 500 });
      }
    }

    // Extract base salary and schedule attributes from submission values if present
    const rawValues = payload.data?.values;
    let extractedSalary: number | null = null;
    let extractedWorkModel: string | null = null;
    let extractedHybridDays: string[] | null = null;
    let extractedShiftStart: string | null = null;
    let extractedShiftEnd: string | null = null;

    const parseValue = (keys: string[]) => {
      if (Array.isArray(rawValues)) {
        const item = rawValues.find((v) => v && typeof v.field === "string" && keys.includes(v.field));
        return item?.value != null ? String(item.value).trim() : null;
      } else if (rawValues && typeof rawValues === "object") {
        const vals = rawValues as Record<string, unknown>;
        for (const key of keys) {
          if (vals[key] != null) return String(vals[key]).trim();
        }
      }
      return null;
    };

    const rawSalary = parseValue(["base_salary", "salary", "phMonthlyBasicSalary"]);
    if (rawSalary) {
      const parsed = Number(rawSalary.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed) && parsed > 0) extractedSalary = parsed;
    }

    const rawModel = parseValue(["work_model", "work_arrangement", "workModel", "workArrangement"]);
    if (rawModel) {
      const norm = rawModel.toLowerCase();
      if (norm.includes("hybrid")) extractedWorkModel = "hybrid";
      else if (norm.includes("wfh") || norm.includes("remote")) extractedWorkModel = "wfh";
      else if (norm.includes("onsite") || norm.includes("on-site")) extractedWorkModel = "onsite";
    }

    const rawHybridDays = parseValue(["hybrid_days", "hybrid_onsite_days", "hybridDays"]);
    if (rawHybridDays) {
      if (Array.isArray(rawHybridDays)) {
        extractedHybridDays = (rawHybridDays as unknown[]).map((d) => String(d).trim()).filter(Boolean);
      } else if (typeof rawHybridDays === "string") {
        try {
          const parsedJson = JSON.parse(rawHybridDays);
          if (Array.isArray(parsedJson)) {
            extractedHybridDays = parsedJson.map((d) => String(d).trim()).filter(Boolean);
          } else {
            extractedHybridDays = rawHybridDays.split(",").map((d) => d.trim()).filter(Boolean);
          }
        } catch {
          extractedHybridDays = rawHybridDays.split(",").map((d) => d.trim()).filter(Boolean);
        }
      }
    }

    const rawShiftStart = parseValue(["shift_start", "shiftStart"]);
    if (rawShiftStart) extractedShiftStart = rawShiftStart;

    const rawShiftEnd = parseValue(["shift_end", "shiftEnd"]);
    if (rawShiftEnd) extractedShiftEnd = rawShiftEnd;

    if (offerToUpdate) {
      const existingMetadata = (
        (offerToUpdate as { metadata?: Record<string, unknown> | null }).metadata ?? {}
      ) as Record<string, unknown>;
      const updatedMetadata = {
        ...existingMetadata,
        ...(extractedSalary != null ? { base_salary: extractedSalary } : {}),
        ...(extractedWorkModel ? { work_model: extractedWorkModel } : {}),
        ...(extractedHybridDays && extractedHybridDays.length > 0 ? { hybrid_onsite_days: extractedHybridDays } : {}),
        ...(extractedShiftStart ? { shift_start: extractedShiftStart } : {}),
        ...(extractedShiftEnd ? { shift_end: extractedShiftEnd } : {}),
      };

      const { error: updateJobOfferError } = await admin
        .from("job_offers")
        .update({
          latest_docuseal_url: offerToUpdate.latest_docuseal_url ?? payload.data?.submission?.url ?? null,
          ...(extractedSalary != null ? { salary: extractedSalary } : {}),
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", offerToUpdate.id);

      if (updateJobOfferError) {
        return NextResponse.json({ error: updateJobOfferError.message }, { status: 500 });
      }
    }

    const lifecycleResult = await markOfferSigned({
      applicationId,
      offerId: offerToUpdate?.id ?? null,
      source: "webhook",
      signedAt: payload.data?.completed_at || new Date().toISOString(),
    });

    if (lifecycleResult.error) {
      return NextResponse.json({ error: lifecycleResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, changed: lifecycleResult.changed });
  }

  if (eventType === "form.declined" || eventType === "submission.declined" || eventType === "submission.expired") {
    const isDeclined = eventType === "form.declined" || eventType === "submission.declined";
    const offerToUpdate = jobOffer ?? linkedJobOffer;

    if (signedDocument) {
      const { error: updateDocumentError } = await admin
        .from("signed_documents")
        .update({
          metadata: {
            ...(signedDocument.metadata ?? {}),
            docuseal_event: payload.event_type,
            decline_reason: payload.data?.decline_reason ?? null,
          },
        })
        .eq("id", signedDocument.id);

      if (updateDocumentError) {
        return NextResponse.json({ error: updateDocumentError.message }, { status: 500 });
      }
    }

    const lifecycleResult = isDeclined
      ? await markOfferDeclined({
          applicationId,
          offerId: offerToUpdate?.id ?? null,
          source: "webhook",
        })
      : await markOfferExpired({
          applicationId,
          offerId: offerToUpdate?.id ?? null,
          source: "webhook",
        });

    if (lifecycleResult.error) {
      return NextResponse.json({ error: lifecycleResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, changed: lifecycleResult.changed });
  }

  return NextResponse.json({ success: true, ignored: true });
}

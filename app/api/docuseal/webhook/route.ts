import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getContractBucketName } from "@/lib/supabase/storage";
import { downloadDocusealDocument, normalizeDocusealWebhook } from "@/lib/docuseal";
import { sendNotification } from "@/lib/notifications";

export const runtime = "nodejs";

function verifyDocusealSignature(rawBody: string, signatureHeader: string) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const receivedSignature = signatureHeader.replace(/^sha256=/i, "");
  const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (receivedSignature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(receivedSignature, "hex")
    );
  } catch {
    return false;
  }
}

function formatName(profile: { first_name?: string | null; last_name?: string | null } | null | undefined) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-docuseal-signature") ?? "";

  if (!verifyDocusealSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = normalizeDocusealWebhook(JSON.parse(rawBody));
  const eventType = payload.event_type ?? "";
  const externalId = payload.data?.external_id ?? null;

  if (!externalId) {
    return NextResponse.json({ error: "external_id is required" }, { status: 400 });
  }

  const admin = getAdminClient();
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
      applications (
        id,
        candidate_id,
        job_posting_id,
        status,
        profiles (
          first_name,
          last_name,
          email
        ),
        job_postings (
          created_by,
          title
        )
      )
    `)
    .eq("id", externalId)
    .maybeSingle();

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
          applications (
            id,
            candidate_id,
            job_posting_id,
            status,
            profiles (
              first_name,
              last_name,
              email
            ),
            job_postings (
              created_by,
              title
            )
          )
        `)
        .eq("id", externalId)
        .maybeSingle();

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
    if (signedDocument?.status === "signed" || jobOffer?.status === "HIRED") {
      return NextResponse.json({ success: true, skipped: true });
    }

    const documents = payload.data?.documents ?? [];
    const signedPdfUrl = documents[0]?.url ?? payload.data?.submission?.combined_document_url ?? payload.data?.submission?.url ?? null;

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
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    if (signedDocument) {
      const { error: updateDocumentError } = await admin
        .from("signed_documents")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          pdf_file_path: storagePath,
          docuseal_submission_url: payload.data?.submission?.url ?? signedDocument.docuseal_submission_url,
          docuseal_submitter_id: signedDocument.docuseal_submitter_id ?? externalId,
          metadata: {
            ...(signedDocument.metadata ?? {}),
            docuseal_event: payload.event_type,
            docuseal_submission_id: payload.data?.submission?.id ?? null,
            docuseal_audit_log_url: payload.data?.submission?.audit_log_url ?? null,
            docuseal_combined_document_url: payload.data?.submission?.combined_document_url ?? null,
          },
        })
        .eq("id", signedDocument.id);

      if (updateDocumentError) {
        return NextResponse.json({ error: updateDocumentError.message }, { status: 500 });
      }
    }

    const { error: updateJobOfferError } = jobOffer
      ? await admin
          .from("job_offers")
          .update({
            status: "HIRED",
            latest_docuseal_url: jobOffer.latest_docuseal_url ?? payload.data?.submission?.url ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobOffer.id)
      : { error: null };

    if (updateJobOfferError) {
      return NextResponse.json({ error: updateJobOfferError.message }, { status: 500 });
    }

    const { error: updateApplicationError } = await admin
      .from("applications")
      .update({
        status: "hired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateApplicationError) {
      return NextResponse.json({ error: updateApplicationError.message }, { status: 500 });
    }

    const application = (signedDocument?.applications ?? jobOffer?.applications) as {
      candidate_id?: string;
      job_postings?: { created_by?: string | null; title?: string | null } | null;
      profiles?: { first_name?: string | null; last_name?: string | null } | null;
    } | null;

    if (application?.candidate_id) {
      await sendNotification({
        supabase: admin,
        recipientId: application.candidate_id,
        type: "offer_accepted",
        title: "Offer Signed",
        body: "Your signed contract has been received. We will be in touch with onboarding details.",
        actionUrl: `/applications/${applicationId}`,
      });
    }

    if (application?.job_postings?.created_by) {
      await sendNotification({
        supabase: admin,
        recipientId: application.job_postings.created_by,
        type: "offer_accepted",
        title: "Candidate Signed Offer",
        body: `${formatName(application.profiles) || "The candidate"} has signed the offer for ${application.job_postings.title ?? "this position"}.`,
        actionUrl: `/applications/${applicationId}`,
      });
    }

    return NextResponse.json({ success: true });
  }

  if (eventType === "form.declined" || eventType === "submission.expired") {
    if (signedDocument) {
      const { error: updateDocumentError } = await admin
        .from("signed_documents")
        .update({
          status: eventType === "form.declined" ? "declined" : "expired",
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

    if (jobOffer) {
      const { error: updateJobOfferError } = await admin
        .from("job_offers")
        .update({
          status: eventType === "form.declined" ? "DECLINED" : "EXPIRED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobOffer.id);

      if (updateJobOfferError) {
        return NextResponse.json({ error: updateJobOfferError.message }, { status: 500 });
      }
    }

    const { error: updateApplicationError } = await admin
      .from("applications")
      .update({
        status: "interviewed",
        contract_offer_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateApplicationError) {
      return NextResponse.json({ error: updateApplicationError.message }, { status: 500 });
    }

    const application = (signedDocument?.applications ?? jobOffer?.applications) as {
      candidate_id?: string;
      job_postings?: { created_by?: string | null; title?: string | null } | null;
      profiles?: { first_name?: string | null; last_name?: string | null } | null;
    } | null;

    if (application?.job_postings?.created_by) {
      await sendNotification({
        supabase: admin,
        recipientId: application.job_postings.created_by,
        type: eventType === "form.declined" ? "offer_declined" : "offer_letter",
        title: eventType === "form.declined" ? "Offer Declined" : "Offer Expired",
        body:
          eventType === "form.declined"
            ? `${formatName(application.profiles) || "The candidate"} declined the offer for ${application.job_postings.title ?? "this position"}.`
            : `The offer for ${application.job_postings.title ?? "this position"} has expired.`,
        actionUrl: `/applications/${applicationId}`,
      });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true, ignored: true });
}

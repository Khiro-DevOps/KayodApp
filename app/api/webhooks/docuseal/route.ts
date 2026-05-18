// ============================================================
// SAVE THIS AS: app/api/webhooks/docuseal/route.ts
// DocuSeal Webhook Handler
// ============================================================

import { NextRequest, NextResponse } from "next/server";

/**
 * Handle DocuSeal webhook events
 * Supported events:
 * - submission.completed: Candidate signed the contract
 * - submission.declined: Candidate declined the offer
 * - submission.expired: Offer signing deadline passed
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      event_type?: string;
      data?: {
        external_id?: string;
        decline_reason?: string;
        completed_at?: string;
        declined_at?: string;
        audit_log_url?: string | null;
        combined_document_url?: string | null;
        documents?: Array<{ url?: string | null }>;
        submission?: {
          id?: number;
          status?: string;
          url?: string;
          audit_log_url?: string | null;
          combined_document_url?: string | null;
          documents?: Array<{ url?: string | null }>;
        };
      };
    };

    const eventType = payload.event_type;
    const externalId = payload.data?.external_id;

    console.log(`[DocuSeal Webhook] Received event: ${eventType}, external_id: ${externalId}`);

    // Always return 200 to avoid DocuSeal retries
    if (!eventType || !externalId) {
      console.warn("[DocuSeal Webhook] Missing event_type or external_id");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Create a Supabase client with service role for backend operations
    // Note: This webhook runs in the server, so we need to set up Supabase manually
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[DocuSeal Webhook] Supabase credentials not configured");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Since we can't use createClient() in a route handler (it needs cookies()),
    // we'll use the service client approach
    const { createClient: createServerClient } = await import("@supabase/supabase-js");
    const supabase = createServerClient(
      supabaseUrl,
      supabaseServiceKey
    );

    // Resolve either the legacy signed document or the modern job offer record.
    const { data: signedDocument, error: signedDocumentError } = await supabase
      .from("signed_documents")
      .select("id, application_id, status")
      .eq("id", externalId)
      .maybeSingle();

    const { data: jobOffer, error: jobOfferError } = signedDocument
      ? { data: null, error: null }
      : await supabase
          .from("job_offers")
          .select("id, application_id, status, latest_docuseal_url, updated_at")
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

    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status, job_postings ( title )")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !application) {
      console.warn(`[DocuSeal Webhook] Application not found for submission ${externalId}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    let newStatus: string | null = null;
    let updates: Record<string, unknown> = {};
    let applicationUpdates: Record<string, unknown> | null = null;

    switch (eventType) {
      case "form.completed":
      case "submission.completed":
        const completedPdfUrl =
          payload.data?.combined_document_url ??
          payload.data?.submission?.combined_document_url ??
          payload.data?.documents?.[0]?.url ??
          payload.data?.submission?.documents?.[0]?.url ??
          payload.data?.submission?.url ??
          null;
        newStatus = "signed";
        updates = {
          status: newStatus,
          signed_at: payload.data?.completed_at || new Date().toISOString(),
          ...(completedPdfUrl ? { pdf_file_path: completedPdfUrl } : {}),
        };
        applicationUpdates = { status: "hired" };
        if (jobOffer) {
          await supabase
            .from("job_offers")
            .update({
              status: "HIRED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobOffer.id);
        }
        console.log(
          `[DocuSeal Webhook] Offer signed for application ${application.id}`
        );
        break;

      case "form.declined":
      case "submission.declined":
        newStatus = "declined";
        updates = {
          status: newStatus,
        };
        applicationUpdates = { status: "rejected" };
        if (jobOffer) {
          await supabase
            .from("job_offers")
            .update({
              status: "DECLINED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobOffer.id);
        }
        console.log(
          `[DocuSeal Webhook] Offer declined for application ${application.id}`
        );
        break;

      case "submission.expired":
        newStatus = "expired";
        updates = {
          status: newStatus,
        };
        applicationUpdates = { status: "rejected" };
        if (jobOffer) {
          await supabase
            .from("job_offers")
            .update({
              status: "EXPIRED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobOffer.id);
        }
        console.log(
          `[DocuSeal Webhook] Offer expired for application ${application.id}`
        );
        break;

      default:
        console.log(`[DocuSeal Webhook] Unrecognized event type: ${eventType}`);
        return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Update the signed document record.
    if (signedDocument && newStatus && Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("signed_documents")
        .update(updates)
        .eq("id", signedDocument.id);

      if (updateError) {
        console.error(
          `[DocuSeal Webhook] Failed to update signed document: ${updateError.message}`
        );
      } else {
        console.log(
          `[DocuSeal Webhook] Updated signed document ${signedDocument.id} to status ${newStatus}`
        );
      }

      if (applicationUpdates) {
        const { error: applicationUpdateError } = await supabase
          .from("applications")
          .update(applicationUpdates)
          .eq("id", application.id);

        if (applicationUpdateError) {
          console.error(
            `[DocuSeal Webhook] Failed to update application: ${applicationUpdateError.message}`
          );
        }
      }

      // Create notification for candidate
      try {
        const notificationTitle = {
          signed: "Offer Accepted ✅",
          declined: "Offer Declined",
          expired: "Offer Expired",
        }[newStatus] || "Offer Update";

        const notificationBody = {
          signed: "Congratulations! Your offer has been accepted. We look forward to welcoming you!",
          declined: payload.data?.decline_reason
            ? `Your offer has been declined. Reason: ${payload.data.decline_reason}`
            : "Your offer has been declined.",
          expired: "Your offer has expired. Please contact HR if you wish to discuss further.",
        }[newStatus] || "Your offer status has been updated.";

        await supabase
          .from("notifications")
          .insert({
            recipient_id: application.candidate_id,
            type: "offer_letter",
            title: notificationTitle,
            body: notificationBody,
            action_url: `/applications/${application.id}`,
          });
      } catch (notificationError) {
        console.error(
          "[DocuSeal Webhook] Failed to create notification:",
          notificationError
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DocuSeal Webhook] Error processing webhook:", error);
    // Still return 200 to avoid retries
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

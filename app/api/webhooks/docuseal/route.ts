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

    // Try job_offers first (modern flow — externalId = job_offers.id)
    const { data: jobOffer, error: jobOfferError } = await supabase
      .from("job_offers")
      .select("id, application_id, status")
      .eq("id", externalId)
      .maybeSingle();
    console.log('[DocuSeal Webhook] job_offers lookup result', { jobOffer, jobOfferError });

    // Fall back to signed_documents (legacy flow — externalId = signed_documents.id)
    const { data: signedDocument, error: signedDocumentError } = !jobOffer
      ? await supabase
          .from("signed_documents")
          .select("id, application_id, status")
          .eq("id", externalId)
          .maybeSingle()
      : { data: null, error: null };
    console.log('[DocuSeal Webhook] signed_documents lookup result', { signedDocument, signedDocumentError });

    // If signed_documents found, also look up the linked job_offer
    let linkedJobOffer = jobOffer;
    if (signedDocument && !linkedJobOffer) {
      const { data: linkedOffer, error: linkedOfferError } = await supabase
        .from("job_offers")
        .select("id, application_id, status")
        .eq("application_id", signedDocument.application_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      linkedJobOffer = linkedOffer;
      console.log('[DocuSeal Webhook] linked job_offers lookup for signed_document', { linkedOffer, linkedOfferError });
    }

    if (jobOfferError && signedDocumentError) {
      console.error("[DocuSeal Webhook] Failed to resolve offer by external_id:", {
        externalId,
        jobOfferError: jobOfferError?.message,
        signedDocumentError: signedDocumentError?.message,
      });
    }

    if (!signedDocument && !jobOffer) {
      console.warn(`[DocuSeal Webhook] Offer not found for submission ${externalId}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const applicationId =
      jobOffer?.application_id ??
      signedDocument?.application_id ??
      null;

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
      case "submission.completed": {
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
        const now = new Date().toISOString();
        // Update job_offers (modern flow)
        if (linkedJobOffer) {
          const { data: jobOfferUpdateData, error: jobOfferUpdateError } = await supabase
            .from("job_offers")
            .update({ status: "SIGNED", updated_at: now })
            .eq("id", linkedJobOffer.id);
          console.log('[DocuSeal Webhook] job_offers update result', { jobOfferUpdateData, jobOfferUpdateError });
        }
        
        console.log(
          `[DocuSeal Webhook] Offer signed for application ${application.id}`
        );
        break;
      }

      case "form.declined":
      case "submission.declined": {
        newStatus = "declined";
        updates = {
          status: newStatus,
        };
        applicationUpdates = { status: "rejected" };
        
        const now = new Date().toISOString();
        // Update job_offers (modern flow)
        if (linkedJobOffer) {
          await supabase
            .from("job_offers")
            .update({
              status: "DECLINED",
              updated_at: now,
            })
            .eq("id", linkedJobOffer.id);
        }
        
        console.log(
          `[DocuSeal Webhook] Offer declined for application ${application.id}`
        );
        break;
      }

      case "submission.expired": {
        newStatus = "expired";
        updates = {
          status: newStatus,
        };
        applicationUpdates = { status: "rejected" };
        
        const now = new Date().toISOString();
        // Update job_offers (modern flow)
        if (linkedJobOffer) {
          await supabase
            .from("job_offers")
            .update({
              status: "EXPIRED",
              updated_at: now,
            })
            .eq("id", linkedJobOffer.id);
        }
        
        console.log(
          `[DocuSeal Webhook] Offer expired for application ${application.id}`
        );
        break;
      }

      default:
        console.log(`[DocuSeal Webhook] Unrecognized event type: ${eventType}`);
        return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Update the signed document record.
    if (signedDocument && newStatus && Object.keys(updates).length > 0) {
      const { data: signedUpdateData, error: updateError } = await supabase
        .from("signed_documents")
        .update(updates)
        .eq("id", signedDocument.id);

      console.log('[DocuSeal Webhook] signed_documents update result', { signedUpdateData, updateError });

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
        const { data: appUpdateData, error: applicationUpdateError } = await supabase
          .from("applications")
          .update(applicationUpdates)
          .eq("id", application.id);

        console.log('[DocuSeal Webhook] applications update result', { appUpdateData, applicationUpdateError });

        if (applicationUpdateError) {
          console.error(
            `[DocuSeal Webhook] Failed to update application: ${applicationUpdateError.message}`
          );
        }
      }

      // Create notification for candidate
      try {
        const notificationTitle = {
          signed: "Offer Signed ✅",
          declined: "Offer Declined",
          expired: "Offer Expired",
        }[newStatus] || "Offer Update";

        const notificationBody = {
          signed: "Your offer has been signed. We will follow up with onboarding instructions.",
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

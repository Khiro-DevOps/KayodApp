"use server";

import { createDocusealSubmission } from "@/lib/docuseal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";
import type { JobOfferTerms, NegotiationItem } from "@/lib/types";

/**
 * Create and send a job offer to a candidate
 */
export async function createJobOffer(
  applicationId: string,
  terms: JobOfferTerms,
  expiryDays: number = 7
): Promise<{ success: boolean; offerId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch application
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Verify HR owns the job
    const { data: job } = await supabase
      .from("job_postings")
      .select("id, created_by, title, docuseal_template_id")
      .eq("id", application.job_posting_id)
      .single();

    if (!job || job.created_by !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!job.docuseal_template_id) {
      return { success: false, error: "DocuSeal template not found for this job" };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Reuse existing legacy offer row for this application when present.
    // `job_offer_applications.application_id` is unique, so a second insert would fail.
    const { data: existingOffer } = await supabase
      .from("job_offer_applications")
      .select("id, version")
      .eq("application_id", applicationId)
      .maybeSingle();

    const nextVersion = Number(existingOffer?.version ?? 0) + 1;

    const basePayload = {
      applicant_id: application.candidate_id,
      hr_id: user.id,
      template_id: job.docuseal_template_id,
      terms,
      expires_at: expiresAt.toISOString(),
      status: "pending",
      version: nextVersion,
      issued_at: new Date().toISOString(),
      viewed_at: null,
      accepted_at: null,
      negotiation_round: 0,
      submission_id: null,
      signed_pdf_url: null,
      updated_at: new Date().toISOString(),
    };

    const offerMutation = existingOffer
      ? supabase
          .from("job_offer_applications")
          .update(basePayload)
          .eq("id", existingOffer.id)
      : supabase
          .from("job_offer_applications")
          .insert({
            application_id: applicationId,
            ...basePayload,
          });

    const { data: offer, error: offerError } = await offerMutation
      .select()
      .single();

    if (offerError || !offer) {
      return { success: false, error: `Failed to create offer: ${offerError?.message}` };
    }

    // Get candidate info for notification
    const { data: candidate } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("id", application.candidate_id)
      .single();

    // Send notification to applicant (routed to job offer page, not pipeline)
    if (candidate) {
      await sendNotification({
        supabase,
        recipientId: application.candidate_id,
        type: "offer_sent",
        title: "🎉 Job Offer Received!",
        body: `You have received a job offer for ${job.title}. Review the terms and sign the contract.`,
        actionUrl: `/job-offer/${offer.id}`,
        senderId: user.id,
      });
    }

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "offer_sent" })
      .eq("id", applicationId);

    revalidatePath("/dashboard");
    revalidatePath(`/job-offer/${offer.id}`);

    return { success: true, offerId: offer.id };
  } catch (error) {
    console.error("Error creating job offer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create job offer",
    };
  }
}

/**
 * Mark offer as viewed by applicant
 */
export async function markOfferViewed(offerId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const { error } = await supabase
      .from("job_offer_applications")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", offerId)
      .eq("applicant_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/job-offer/${offerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error marking offer viewed:", error);
    return { success: false, error: "Failed to mark offer as viewed" };
  }
}

/**
 * Submit negotiation request for an offer
 */
export async function submitNegotiation(
  offerId: string,
  items: NegotiationItem[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch the offer
    const { data: offer, error: offerError } = await supabase
      .from("job_offer_applications")
      .select("id, applicant_id, hr_id, negotiation_round, status")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return { success: false, error: "Offer not found" };
    }

    if (offer.applicant_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (offer.status === "accepted" || offer.status === "declined" || offer.status === "expired") {
      return { success: false, error: "Cannot negotiate on this offer status" };
    }

    // Check negotiation round limit
    if (offer.negotiation_round >= 3) {
      return { success: false, error: "Maximum negotiation rounds (3) reached" };
    }

    const nextRound = offer.negotiation_round + 1;

    // Create negotiation request
    const { data: negotiation, error: negError } = await supabase
      .from("negotiation_requests")
      .insert({
        offer_id: offerId,
        round: nextRound,
        submitted_by: user.id,
        items,
        status: "pending",
      })
      .select()
      .single();

    if (negError || !negotiation) {
      return { success: false, error: `Failed to create negotiation: ${negError?.message}` };
    }

    // Update offer status and round
    const { error: updateError } = await supabase
      .from("job_offer_applications")
      .update({
        status: "negotiating",
        negotiation_round: nextRound,
      })
      .eq("id", offerId);

    if (updateError) {
      return { success: false, error: "Failed to update offer status" };
    }

    // Get offer and HR info for notification
    const { data: offerDetail } = await supabase
      .from("job_offer_applications")
      .select("*, applications(job_postings(title))")
      .eq("id", offerId)
      .single();

    const jobTitle = (offerDetail?.applications as any)?.job_postings?.title || "this offer";

    // Notify HR
    const { data: applicant } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const applicantName = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(" ");

    await sendNotification({
      supabase,
      recipientId: offer.hr_id,
      type: "offer_negotiation_submitted",
      title: "📋 Negotiation Request Received",
      body: `${applicantName} has submitted a negotiation request for ${jobTitle}.`,
      actionUrl: `/job-offer/${offerId}`,
      senderId: user.id,
    });

    revalidatePath(`/job-offer/${offerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error submitting negotiation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit negotiation",
    };
  }
}

/**
 * Applicant declines an offer
 */
export async function declineOffer(offerId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch offer
    const { data: offer, error: offerError } = await supabase
      .from("job_offer_applications")
      .select("id, applicant_id, hr_id, status")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return { success: false, error: "Offer not found" };
    }

    if (offer.applicant_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from("job_offer_applications")
      .update({ status: "declined" })
      .eq("id", offerId);

    if (updateError) {
      return { success: false, error: "Failed to decline offer" };
    }

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "rejected" })
      .eq("id", offer.id);

    // Get applicant and job info for notification
    const { data: applicant } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const { data: offerDetail } = await supabase
      .from("job_offer_applications")
      .select("*, applications(job_postings(title))")
      .eq("id", offerId)
      .single();

    const jobTitle = (offerDetail?.applications as any)?.job_postings?.title || "this offer";
    const applicantName = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(" ");

    // Notify HR
    await sendNotification({
      supabase,
      recipientId: offer.hr_id,
      type: "offer_declined",
      title: "❌ Offer Declined",
      body: `${applicantName} has declined the offer for ${jobTitle}.`,
      actionUrl: `/job-offer/${offerId}`,
      senderId: user.id,
    });

    revalidatePath(`/job-offer/${offerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error declining offer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to decline offer",
    };
  }
}

/**
 * HR responds to negotiation request
 */
export async function respondToNegotiation(
  negotiationId: string,
  hrResponse: Record<number, { action: string; counterValue?: string; notes?: string }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch negotiation and offer
    const { data: negotiation, error: negError } = await supabase
      .from("negotiation_requests")
      .select("*, job_offer_applications(id, applicant_id, hr_id, status)")
      .eq("id", negotiationId)
      .single();

    if (negError || !negotiation) {
      return { success: false, error: "Negotiation request not found" };
    }

    const offer = (negotiation.job_offer_applications as any);
    if (offer.hr_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Determine if any item is countered
    const hasCounters = Object.values(hrResponse).some((r: any) => r.action === "counter");

    // Update negotiation request
    const { error: updateError } = await supabase
      .from("negotiation_requests")
      .update({
        hr_response: hrResponse,
        status: hasCounters ? "countered" : "approved",
        responded_at: new Date().toISOString(),
      })
      .eq("id", negotiationId);

    if (updateError) {
      return { success: false, error: "Failed to respond to negotiation" };
    }

    // If countered, update offer status back to pending
    if (hasCounters) {
      await supabase
        .from("job_offer_applications")
        .update({ status: "pending", version: (offer.version || 1) + 1 })
        .eq("id", offer.id);
    }

    // Get applicant and job info for notification
    const { data: applicant } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", offer.applicant_id)
      .single();

    const { data: offerDetail } = await supabase
      .from("job_offer_applications")
      .select("*, applications(job_postings(title))")
      .eq("id", offer.id)
      .single();

    const jobTitle = (offerDetail?.applications as any)?.job_postings?.title || "this offer";

    // Notify applicant
    const statusText = hasCounters ? "HR has updated your offer" : "HR has approved your negotiation request";
    await sendNotification({
      supabase,
      recipientId: offer.applicant_id,
      type: "offer_negotiation_responded",
      title: "📝 Negotiation Response",
      body: `${statusText} for ${jobTitle}. Please review.`,
      actionUrl: `/job-offer/${offer.id}`,
      senderId: user.id,
    });

    revalidatePath(`/job-offer/${offer.id}`);
    return { success: true };
  } catch (error) {
    console.error("Error responding to negotiation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to respond to negotiation",
    };
  }
}

/**
 * Revoke an offer (HR only)
 */
export async function revokeOffer(offerId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch offer
    const { data: offer, error: offerError } = await supabase
      .from("job_offer_applications")
      .select("id, hr_id, applicant_id, status")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return { success: false, error: "Offer not found" };
    }

    if (offer.hr_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (offer.status === "accepted") {
      return { success: false, error: "Cannot revoke an accepted offer" };
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from("job_offer_applications")
      .update({ status: "declined" })
      .eq("id", offerId);

    if (updateError) {
      return { success: false, error: "Failed to revoke offer" };
    }

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "rejected" })
      .eq("id", offer.id);

    // Notify applicant
    await sendNotification({
      supabase,
      recipientId: offer.applicant_id,
      type: "offer_declined",
      title: "📋 Offer Withdrawn",
      body: "The offer has been withdrawn by the hiring team.",
      actionUrl: `/job-offer/${offerId}`,
      senderId: user.id,
    });

    revalidatePath(`/job-offer/${offerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error revoking offer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke offer",
    };
  }
}

/**
 * Accept offer and create DocuSeal submission
 */
export async function acceptOffer(offerId: string): Promise<{
  success: boolean;
  submissionUrl?: string;
  embedSrc?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Fetch offer
    const { data: offer, error: offerError } = await supabase
      .from("job_offer_applications")
      .select("*, applications(job_postings(title))")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return { success: false, error: "Offer not found" };
    }

    if (offer.applicant_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (offer.status !== "pending" && offer.status !== "negotiating") {
      return { success: false, error: "This offer cannot be accepted in its current status" };
    }

    // Get candidate info for DocuSeal
    const { data: candidate } = await supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", user.id)
      .single();

    if (!candidate || !candidate.email) {
      return { success: false, error: "Candidate email not found" };
    }

    const candidateName = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ");

    const submission = await createDocusealSubmission({
      templateId: offer.template_id,
      submitterName: candidateName,
      submitterEmail: candidate.email,
      externalId: offerId,
      sendEmail: true,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/job-offer/${offerId}`,
    });

    if (!submission.viewerUrl || !submission.embedSrc) {
      return {
        success: false,
        error: "DocuSeal did not return a valid submission",
      };
    }

    // Update offer with submission ID (but don't mark as accepted yet - wait for webhook)
    const { error: updateError } = await supabase
      .from("job_offer_applications")
      .update({ submission_id: submission.id.toString() })
      .eq("id", offerId);

    if (updateError) {
      return {
        success: false,
        error: `Failed to save submission: ${updateError.message}`,
      };
    }

    const jobTitle = (offer.applications as any)?.job_postings?.title || "this position";

    // Notify HR that signing has started
    const { data: hr } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", offer.hr_id)
      .single();

    await sendNotification({
      supabase,
      recipientId: offer.hr_id,
      type: "offer_accepted",
      title: "✍️ Candidate Started Signing",
      body: `${candidateName} has started the signing process for the ${jobTitle} offer.`,
      actionUrl: `/job-offer/${offerId}`,
      senderId: user.id,
    });

    revalidatePath(`/job-offer/${offerId}`);

    return {
      success: true,
      submissionUrl: submission.viewerUrl,
      embedSrc: submission.embedSrc,
    };
  } catch (error) {
    console.error("Error accepting offer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to accept offer",
    };
  }
}

/**
 * Process DocuSeal webhook when applicant completes signing
 */
export async function processDocuSealCompletion(
  submissionId: string,
  submissionUrl: string,
  signedPdfUrl: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Find offer by submission ID
    const { data: offer, error: offerError } = await supabase
      .from("job_offer_applications")
      .select("id, applicant_id, hr_id, application_id")
      .eq("submission_id", submissionId)
      .single();

    if (offerError || !offer) {
      return { success: false, error: "Offer not found for this submission" };
    }

    // Update offer with signed PDF and mark as accepted
    const { error: updateError } = await supabase
      .from("job_offer_applications")
      .update({
        status: "accepted",
        signed_pdf_url: signedPdfUrl,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", offer.id);

    if (updateError) {
      return { success: false, error: "Failed to update offer status" };
    }

    // Update application status to hired
    await supabase
      .from("applications")
      .update({ status: "hired" })
      .eq("id", offer.application_id);

    const { data: modernJobOffer } = await supabase
      .from("job_offers")
      .select("id, status, latest_docuseal_url, application_id")
      .eq("application_id", offer.application_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (modernJobOffer) {
      const { error: modernJobOfferUpdateError } = await supabase
        .from("job_offers")
        .update({
          status: "HIRED",
          latest_docuseal_url: modernJobOffer.latest_docuseal_url ?? submissionUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", modernJobOffer.id);

      if (modernJobOfferUpdateError) {
        console.error("Failed to update modern job offer after signing:", modernJobOfferUpdateError);
      }
    }

    // Get applicant and job info for notification
    const { data: applicant } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", offer.applicant_id)
      .single();

    const { data: offerDetail } = await supabase
      .from("job_offer_applications")
      .select("*, applications(job_postings(title))")
      .eq("id", offer.id)
      .single();

    const jobTitle = (offerDetail?.applications as any)?.job_postings?.title || "this position";
    const applicantName = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(" ");

    // Notify HR of successful signing
    await sendNotification({
      supabase,
      recipientId: offer.hr_id,
      type: "offer_accepted",
      title: "✅ Offer Signed Successfully",
      body: `${applicantName} has successfully signed the offer for ${jobTitle}.`,
      actionUrl: `/job-offer/${offer.id}`,
      senderId: offer.applicant_id,
    });

    revalidatePath(`/job-offer/${offer.id}`);

    if (modernJobOffer) {
      revalidatePath(`/job-offer/${modernJobOffer.id}`);
    }
    return { success: true };
  } catch (error) {
    console.error("Error processing DocuSeal completion:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to process signing completion",
    };
  }
}

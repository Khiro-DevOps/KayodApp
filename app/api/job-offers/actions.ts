"use server";

import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

/**
 * Create a new job offer proposal
 */
export async function createJobOfferProposal(
  applicationId: string,
  data: {
    baseSalary: number;
    startDate: string;
    positionTitle: string;
    benefitsSummary?: string;
    otherTerms?: Record<string, unknown>;
  }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/job-offers/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          ...data,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create offer");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Send job offer to candidate
 */
export async function sendJobOfferProposal(jobOfferProposalId: string) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/job-offers/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobOfferProposalId }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to send offer");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Schedule job offer negotiation interview
 */
export async function scheduleJobOfferInterview(
  jobOfferProposalId: string,
  data: {
    interviewType: "online" | "in_person";
    scheduledAt: string;
    durationMinutes?: number;
    timezone?: string;
    location?: { address?: string; notes?: string };
  }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/job-offers/create-jitsi-room`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOfferProposalId,
          ...data,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to schedule interview");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Accept job offer proposal
 */
export async function acceptJobOfferProposal(jobOfferProposalId: string) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Update proposal status to accepted
    const { error: updateError } = await supabase
      .from("job_offer_proposals")
      .update({
        proposal_status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", jobOfferProposalId);

    if (updateError) throw new Error(updateError.message);

    // Get proposal and application info for notification
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select("application_id")
      .eq("id", jobOfferProposalId)
      .single();

    // Send notification to HR
    const { data: application } = await supabase
      .from("applications")
      .select("job_posting_id")
      .eq("id", proposal?.application_id)
      .single();

    const { data: jobPosting } = await supabase
      .from("job_postings")
      .select("created_by")
      .eq("id", application?.job_posting_id)
      .single();

    await sendNotification({
      supabase,
      recipientId: jobPosting?.created_by,
      type: "offer_letter",
      title: "Offer Accepted",
      body: "The candidate has accepted the job offer.",
      actionUrl: `/applications/${proposal?.application_id}`,
      sendPush: true,
    });

    revalidatePath("/applications");
    return { success: true };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Reject job offer proposal
 */
export async function rejectJobOfferProposal(jobOfferProposalId: string) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Update proposal status to rejected
    const { error: updateError } = await supabase
      .from("job_offer_proposals")
      .update({
        proposal_status: "rejected",
        rejected_at: new Date().toISOString(),
      })
      .eq("id", jobOfferProposalId);

    if (updateError) throw new Error(updateError.message);

    // Notification will be auto-triggered by database trigger

    revalidatePath("/applications");
    return { success: true };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Request renegotiation on job offer
 */
export async function requestRenegotiation(
  jobOfferProposalId: string,
  reason: string
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Update proposal status to renegotiate
    const { error: updateError } = await supabase
      .from("job_offer_proposals")
      .update({
        proposal_status: "renegotiate",
      })
      .eq("id", jobOfferProposalId);

    if (updateError) throw new Error(updateError.message);

    // Get proposal and application info for notification
    const { data: proposal } = await supabase
      .from("job_offer_proposals")
      .select("application_id")
      .eq("id", jobOfferProposalId)
      .single();

    // Send notification to HR
    const { data: application } = await supabase
      .from("applications")
      .select("job_posting_id, candidate_id")
      .eq("id", proposal?.application_id)
      .single();

    const { data: jobPosting } = await supabase
      .from("job_postings")
      .select("created_by")
      .eq("id", application?.job_posting_id)
      .single();

    const { data: candidate } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", application?.candidate_id)
      .single();

    await sendNotification({
      supabase,
      recipientId: jobPosting?.created_by,
      type: "offer_letter",
      title: "Renegotiation Requested",
      body: `${candidate?.first_name} ${candidate?.last_name} has requested to renegotiate the job offer. Reason: ${reason}`,
      actionUrl: `/applications/${proposal?.application_id}`,
      sendPush: true,
    });

    revalidatePath("/applications");
    return { success: true };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Generate contract from template
 */
export async function generateContract(
  jobOfferProposalId: string,
  contractTemplateId: string,
  customEdits?: string,
  sendToCandidateNow?: boolean
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/contracts/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOfferProposalId,
          contractTemplateId,
          customEdits,
          sendToCandidateNow,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate contract");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Submit contract signature
 */
export async function submitContractSignature(
  contractId: string,
  signatureBase64: string,
  candidateName: string
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/contracts/submit-signature`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId,
          signatureBase64,
          candidateName,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to sign contract");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

/**
 * Confirm hire and convert to employee
 */
export async function confirmHire(
  applicationId: string,
  employeeStartDate?: string
) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/employee-conversion/confirm-hire`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          employeeStartDate,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to confirm hire");
    }

    const result = await response.json();
    revalidatePath("/applications");
    return result;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unknown error");
  }
}

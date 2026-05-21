"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ApplicationStatus } from "@/lib/types";

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Transition result with detailed information
 */
export interface PipelineTransitionResult {
  success: boolean;
  error?: string;
  applicantName?: string;
  newStatus?: ApplicationStatus;
  requiresModal?: boolean; // e.g., for scheduling interview or confirming hire
  nextAction?: string; // e.g., "schedule_interview", "send_offer", "confirm_hire"
}

/**
 * Move applicant to Screening stage
 * Updates status from submitted/draft to under_review
 */
export async function moveToScreening(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, profiles!applications_candidate_id_fkey(first_name, last_name)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Validate current status is in "new" stage
    if (!["submitted", "draft"].includes(application.status)) {
      return {
        success: false,
        error: `Cannot move to screening from ${application.status} status. Applicant must be in New stage.`,
      };
    }

    // Update status to under_review
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "under_review" as ApplicationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateError) {
      return { success: false, error: `Failed to update status: ${updateError.message}` };
    }

    const profile = toSingle(application.profiles as any);
    const applicantName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

    // Revalidate cache
    revalidatePath("/jobs/manage");
    revalidatePath("/applications");

    return {
      success: true,
      newStatus: "under_review",
      applicantName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Move applicant to Interview stage
 * Requires interview scheduling to be completed
 * This marks the application as interview_scheduled and returns a flag to open the scheduling modal
 */
export async function moveToInterview(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, job_posting_id, profiles!applications_candidate_id_fkey(first_name, last_name)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Validate current status is in "screening" stage
    if (!["under_review", "shortlisted"].includes(application.status)) {
      return {
        success: false,
        error: `Cannot move to interview from ${application.status} status. Applicant must be in Screening stage.`,
      };
    }

    // Check if interview is already scheduled
    const { data: existingInterview } = await supabase
      .from("interviews")
      .select("id")
      .eq("application_id", applicationId)
      .eq("status", "scheduled")
      .single();

    if (existingInterview) {
      // Interview already scheduled, just update the application status
      const { error: updateError } = await supabase
        .from("applications")
        .update({
          status: "interview_scheduled" as ApplicationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (updateError) {
        return { success: false, error: `Failed to update status: ${updateError.message}` };
      }

      const profile = toSingle(application.profiles as any);
      const applicantName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

      revalidatePath("/jobs/manage");
      revalidatePath("/applications");

      return {
        success: true,
        newStatus: "interview_scheduled",
        applicantName,
      };
    }

    // No interview scheduled yet - require user to schedule one
    // Return a flag to open the interview scheduling modal
    return {
      success: false, // Will be handled as a modal requirement
      error: "Interview scheduling required",
      requiresModal: true,
      nextAction: "schedule_interview",
      applicantName: `${toSingle(application.profiles as any)?.first_name || ""} ${toSingle(application.profiles as any)?.last_name || ""}`.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Confirm interview has been scheduled, update application status
 * This is called after the interview is successfully scheduled
 */
export async function confirmInterviewScheduled(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, profiles!applications_candidate_id_fkey(first_name, last_name)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Update status to interview_scheduled
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "interview_scheduled" as ApplicationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateError) {
      return { success: false, error: `Failed to update status: ${updateError.message}` };
    }

    const profile = toSingle(application.profiles as any);
    const applicantName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

    revalidatePath("/jobs/manage");
    revalidatePath("/applications");

    return {
      success: true,
      newStatus: "interview_scheduled",
      applicantName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Move applicant to Offer stage
 * Requires offer to be created and sent
 */
export async function moveToOffer(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select(
        "id, status, job_posting_id, profiles!applications_candidate_id_fkey(first_name, last_name)"
      )
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Validate current status is in "interview" stage
    if (!["interview_scheduled", "interviewed"].includes(application.status)) {
      return {
        success: false,
        error: `Cannot move to offer from ${application.status} status. Applicant must be in Interview stage.`,
      };
    }

    // Check if offer already exists
    const { data: existingOffer } = await supabase
      .from("job_offers")
      .select("id, status")
      .eq("application_id", applicationId)
      .single();

    if (existingOffer) {
      // Offer exists - check if it's been sent
      if (["SENT", "NEGOTIATION_PENDING", "REVISED", "ACCEPTED"].includes(existingOffer.status)) {
        // Offer already sent, update application status to offer_sent
        const { error: updateError } = await supabase
          .from("applications")
          .update({
            status: "offer_sent" as ApplicationStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", applicationId);

        if (updateError) {
          return { success: false, error: `Failed to update status: ${updateError.message}` };
        }

        const profile = toSingle(application.profiles as any);
        const applicantName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

        revalidatePath("/jobs/manage");
        revalidatePath("/applications");

        return {
          success: true,
          newStatus: "offer_sent",
          applicantName,
        };
      }
    }

    // No offer or offer not sent yet - require user to create/send offer
    return {
      success: false, // Will be handled as a modal requirement
      error: "Offer creation and sending required",
      requiresModal: true,
      nextAction: "send_offer",
      applicantName: `${toSingle(application.profiles as any)?.first_name || ""} ${toSingle(application.profiles as any)?.last_name || ""}`.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Confirm offer has been sent, update application status
 */
export async function confirmOfferSent(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, profiles!applications_candidate_id_fkey(first_name, last_name)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Update status to offer_sent
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "offer_sent" as ApplicationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateError) {
      return { success: false, error: `Failed to update status: ${updateError.message}` };
    }

    const applicantName = `${toSingle(application.profiles as any)?.first_name || ""} ${toSingle(application.profiles as any)?.last_name || ""}`.trim();

    revalidatePath("/jobs/manage");
    revalidatePath("/applications");

    return {
      success: true,
      newStatus: "offer_sent",
      applicantName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Move applicant to Hired stage
 * Requires offer to be signed and hire to be confirmed
 */
export async function moveToHired(applicationId: string): Promise<PipelineTransitionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, profiles!applications_candidate_id_fkey(first_name, last_name)")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Validate current status is in "offer" stage
    if (!["negotiating", "offer_sent"].includes(application.status)) {
      return {
        success: false,
        error: `Cannot move to hired from ${application.status} status. Applicant must be in Offer stage.`,
      };
    }

    // Check offer status
    const { data: offer } = await supabase
      .from("job_offers")
      .select("id, status")
      .eq("application_id", applicationId)
      .single();

    if (!offer) {
      return { success: false, error: "No offer found for this applicant" };
    }

    // Check if offer is signed
    const isSigned = ["ACCEPTED", "SIGNED", "HIRED"].includes(offer.status);

    if (!isSigned) {
      return {
        success: false,
        error: "Offer must be signed before confirming hire",
        requiresModal: true,
        nextAction: "confirm_hire",
        applicantName: `${toSingle(application.profiles as any)?.first_name || ""} ${toSingle(application.profiles as any)?.last_name || ""}`.trim(),
      };
    }

    // Offer is signed but application status not updated yet
    return {
      success: false,
      error: "Hire confirmation required",
      requiresModal: true,
      nextAction: "confirm_hire",
      applicantName: `${toSingle(application.profiles as any)?.first_name || ""} ${toSingle(application.profiles as any)?.last_name || ""}`.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

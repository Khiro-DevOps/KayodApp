"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { InterviewType } from "@/lib/types";
import { createDocusealSubmission } from "@/lib/docuseal";

const JAAS_APP_ID = process.env.JAAS_APP_ID ?? process.env.NEXT_PUBLIC_JAAS_APP_ID;
const JAAS_DOMAIN = "8x8.vc";

function createJitsiRoom(applicationId: string) {
  if (!JAAS_APP_ID) {
    throw new Error("JaaS app ID is not configured");
  }

  const roomName = `kayod-interview-${applicationId.slice(0, 8)}-${Date.now()}`;

  return {
    url: `https://${JAAS_DOMAIN}/${JAAS_APP_ID}/${roomName}`,
    name: roomName,
  };
}

export async function scheduleInterviewProposal(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const rawApplicationId = String(
    formData.get("application_id") ??
      formData.get("applicant_id") ??
      formData.get("candidate_id") ??
      ""
  ).trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const scheduledAt = formData.get("scheduled_at") as string;
  const durationMinutes = Number(formData.get("duration_minutes") as string) || 60;
  const notes = formData.get("notes") as string;
  const timezone = formData.get("timezone") as string;
  const rawModes = formData
    .getAll("available_modes")
    .map((value) => String(value))
    .filter((value): value is InterviewType => value === "online" || value === "in_person");
  const offeredModes = Array.from(new Set(rawModes));
  const locationDetails = (formData.get("location_details") as string | null)?.trim() || null;

  if (!rawApplicationId || !jobId || !scheduledAt) {
    return { success: false, error: "Missing required fields" };
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { success: false, error: "Duration must be a positive number of minutes" };
  }

  if (offeredModes.length === 0) {
    return { success: false, error: "Please choose at least one interview availability option" };
  }

  if (offeredModes.includes("in_person") && !locationDetails) {
    return { success: false, error: "Address/location details are required for in-person interviews" };
  }

  try {
    type ResolvedApplication = {
      id: string;
      candidate_id: string;
      status?: string | null;
      selected_mode?: InterviewType | null;
      job_posting_id?: string | null;
      job_listing_id?: string | null;
    };

    let application: ResolvedApplication | null = null;

    const { data: byApplicationId, error: byApplicationIdError } = await supabase
      .from("applications")
      .select("*")
      .eq("id", rawApplicationId)
      .maybeSingle();

    if (byApplicationIdError) {
      throw byApplicationIdError;
    }

    application = (byApplicationId as ResolvedApplication | null) ?? null;

    const matchesJob = (app: ResolvedApplication | null) => {
      if (!app) return false;
      const appJobId = app.job_posting_id ?? app.job_listing_id ?? null;
      return appJobId === jobId;
    };

    if (application && !matchesJob(application)) {
      application = null;
    }

    if (!application) {
      const { data: byCandidateId, error: byCandidateIdError } = await supabase
        .from("applications")
        .select("*")
        .eq("candidate_id", rawApplicationId)
        .order("submitted_at", { ascending: false })
        .limit(25);

      if (byCandidateIdError) {
        throw byCandidateIdError;
      }

      application =
        ((byCandidateId as ResolvedApplication[] | null) ?? []).find((app) => matchesJob(app)) ?? null;
    }

    if (!application) {
      return {
        success: false,
        error: "Application not found for this job. Refresh the page and try again.",
      };
    }

    const applicationId = application.id;

    if (String(application.status ?? "").toUpperCase() === "COMPLETED") {
      return {
        success: false,
        error: "This application is marked as completed. Rescheduling is locked.",
      };
    }

    const { data: app } = await supabase
      .from("applications")
      .select("job_postings(title)")
      .eq("id", applicationId)
      .single();

    const jobTitle = (app?.job_postings as any)?.title || "the position";

    const selectedMode = application.selected_mode ?? null;
    const interviewType: InterviewType =
      selectedMode && offeredModes.includes(selectedMode)
        ? selectedMode
        : offeredModes[0];

    const hrOfficeAddress = offeredModes.includes("in_person") ? locationDetails : null;

    const { error: appUpdateError } = await supabase
      .from("applications")
      .update({
        hr_offered_modes: offeredModes,
        hr_office_address: hrOfficeAddress,
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      const isMissingColumn =
        appUpdateError.code === "PGRST204" ||
        /column/i.test(appUpdateError.message || "");

      if (isMissingColumn) {
        const { error: fallbackAppUpdateError } = await supabase
          .from("applications")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", applicationId);

        if (fallbackAppUpdateError) {
          throw fallbackAppUpdateError;
        }
      } else {
        throw appUpdateError;
      }
    }

    let meetingLink: string | null = null;
    let meetingRoomName: string | null = null;

    if (interviewType === "online") {
      const room = createJitsiRoom(applicationId);
      meetingLink = room.url;
      meetingRoomName = room.name;
    }

    const payload = {
      applicant_id: applicationId,
      type: interviewType,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_minutes: durationMinutes,
      meeting_link: interviewType === "online" ? meetingLink : null,
      location: interviewType === "in_person" ? hrOfficeAddress : null,
    };

    const { data: existingInterview } = await supabase
      .from("interviews")
      .select("id, status")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (existingInterview?.status === "completed") {
      return {
        success: false,
        error: "This interview is already completed. Rescheduling is locked.",
      };
    }

    let interviewId: string;

    const backgroundTasks: Promise<unknown>[] = [];

    if (existingInterview) {
      const { data, error } = await supabase
        .from("interviews")
        .update({
          scheduled_at: payload.scheduled_at,
          duration_minutes: payload.duration_minutes,
          timezone,
          interview_type: interviewType,
          location_address: payload.location,
          location_notes: null,
          video_room_url: payload.meeting_link,
          video_room_name: meetingRoomName,
          video_provider: interviewType === "online" ? "jitsi" : null,
          interviewer_notes: notes?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInterview.id)
        .select("id, interview_type, scheduled_at")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;

      const rescheduleTarget =
        interviewType === "online"
          ? `Meeting link: ${meetingLink}`
          : `Location: ${hrOfficeAddress}`;

      backgroundTasks.push(
        Promise.resolve(
          supabase.from("notifications").insert({
            recipient_id: application.candidate_id,
            type: "interview_rescheduled",
            title: "Interview Rescheduled 🔄",
            body: `Your interview for ${jobTitle} has been rescheduled. ${rescheduleTarget}`,
            action_url: `/interviews`,
          })
        ).then(() => null).catch((err: unknown) => {
          console.error("Failed to insert rescheduled notification:", err);
        })
      );
    } else {
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          application_id: applicationId,
          scheduled_by: user.id,
          scheduled_at: payload.scheduled_at,
          duration_minutes: payload.duration_minutes,
          timezone,
          interview_type: interviewType,
          status: "scheduled",
          location_address: payload.location,
          location_notes: null,
          video_room_url: payload.meeting_link,
          video_room_name: meetingRoomName,
          video_provider: interviewType === "online" ? "jitsi" : null,
          interviewer_notes: notes?.trim() || null,
        })
        .select("id, interview_type, scheduled_at")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;
    }

    if (!existingInterview) {
      const invitationTarget =
        interviewType === "online"
          ? `Meeting link: ${meetingLink}`
          : `Location: ${hrOfficeAddress}`;

      backgroundTasks.push(
        Promise.resolve(
          supabase.from("notifications").insert({
            recipient_id: application.candidate_id,
            type: "interview_scheduled",
            title: "Interview Invitation 🎉",
            body: `Your interview for ${jobTitle} is scheduled. ${invitationTarget}`,
            action_url: `/interviews`,
          })
        ).then(() => null).catch((err: unknown) => {
          console.error("Failed to insert scheduled notification:", err);
        })
      );
    }

    await supabase
      .from("applications")
      .update({ status: "interview_scheduled" })
      .eq("id", applicationId);

    try {
      revalidatePath(`/jobs/manage/${jobId}/applicants`);
      revalidatePath(`/applications/${applicationId}`);
    } catch (err) {
      console.error("Revalidation error:", err);
    }

    try {
      void Promise.allSettled(backgroundTasks);
    } catch (err) {
      console.error("Background tasks scheduling failed:", err);
    }

    return {
      success: true,
      interviewId,
      payload,
    };
  } catch (error) {
    console.error("Interview scheduling error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (/Connect Timeout Error|UND_ERR_CONNECT_TIMEOUT|timeout/i.test(message)) {
      return {
        success: false,
        error: "Network timeout while contacting an external service (JaaS/Jitsi). The interview may have been saved locally — please check the interview list and try again."
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to schedule interview",
    };
  }
}

export async function submitInterviewPreference(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const preferredType = formData.get("preferred_type") as string;

  if (!applicationId || !preferredType) {
    return { success: false, error: "Missing required fields" };
  }

  if (!["online", "in_person"].includes(preferredType)) {
    return { success: false, error: "Invalid interview type" };
  }

  try {
    const { data: interview } = await supabase
      .from("interviews")
      .select("id, application_id, scheduled_by")
      .eq("application_id", applicationId)
      .single();

    if (!interview) {
      return { success: false, error: "Interview not found" };
    }

    const { error } = await supabase
      .from("interviews")
      .update({
        candidate_interview_type_preference: preferredType,
        preference_submitted_at: new Date().toISOString(),
        preference_status: "submitted",
      })
      .eq("id", interview.id);

    if (error) {
      throw error;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const candidateName = profile
      ? `${profile.first_name} ${profile.last_name}`
      : "Candidate";

    if (interview.scheduled_by) {
      void Promise.resolve(
        supabase.from("notifications").insert({
          recipient_id: interview.scheduled_by,
          type: "application_status_changed",
          title: "Interview Preference Submitted",
          body: `${candidateName} has submitted their interview format preference (${preferredType}).`,
          action_url: `/interviews`,
        })
      ).catch((err: unknown) => {
        console.error("Failed to insert preference notification:", err);
      });
    }

    revalidatePath(`/interviews/respond/${applicationId}`);

    return { success: true };
  } catch (error) {
    console.error("Preference submission error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit preference",
    };
  }
}

// ============================================================
// JOB OFFER ACTIONS (Phase 2)
// ============================================================

export async function sendJobOffer(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const contractTemplateId = formData.get("contract_template_id") as string;
  const signingMethod = formData.get("signing_method") as string;
  const notes = formData.get("notes") as string | null;

  if (!applicationId || !contractTemplateId || !signingMethod) {
    return { success: false, error: "Missing required fields" };
  }

  if (!["digital", "in_person"].includes(signingMethod)) {
    return { success: false, error: "Invalid signing method" };
  }

  try {
    // Verify application exists and belongs to a job by this HR user
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Verify HR user owns the job posting
    const { data: job, error: jobError } = await supabase
      .from("job_postings")
      .select("id, created_by, title")
      .eq("id", application.job_posting_id)
      .single();

    if (jobError || !job || job.created_by !== user.id) {
      return { success: false, error: "Unauthorized: You do not own this job" };
    }

    // Verify contract template exists and belongs to this job
    const { data: template, error: templateError } = await supabase
      .from("contract_templates")
      .select("id, job_posting_id, docuseal_template_id, template_name")
      .eq("id", contractTemplateId)
      .eq("job_posting_id", application.job_posting_id)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Contract template not found for this job" };
    }

    const { data: candidateProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", application.candidate_id)
      .single();

    const candidateEmail = candidateProfile?.email;
    if (signingMethod === "digital" && !candidateEmail) {
      return { success: false, error: "Candidate email is required for digital signing" };
    }

    // Create signed_documents record
    const { data: signedDoc, error: signError } = await supabase
      .from("signed_documents")
      .insert({
        application_id: applicationId,
        contract_template_id: contractTemplateId,
        signing_method: signingMethod,
        status: "sent",
        metadata: {
          ...(notes ? { hr_notes: notes } : {}),
          docuseal_template_id: template.docuseal_template_id,
        },
      })
      .select("id")
      .single();

    if (signError || !signedDoc) {
      throw signError || new Error("Failed to create signed document");
    }

    let docusealSigningUrl: string | null = null;

    if (signingMethod === "digital") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
      const candidateName = [candidateProfile?.first_name, candidateProfile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Candidate";

      const submission = await createDocusealSubmission({
        templateId: template.docuseal_template_id,
        submissionName: `${job.title} - ${candidateName}`,
        submitterName: candidateName,
        submitterEmail: candidateEmail!,
        externalId: signedDoc.id,
        redirectUrl: `${appUrl}/applications/${applicationId}`,
      });

      docusealSigningUrl = submission.signingUrl;

      const { error: submissionUpdateError } = await supabase
        .from("signed_documents")
        .update({
          docuseal_submitter_id: submission.submitterId ?? signedDoc.id,
          docuseal_submission_url: submission.signingUrl,
          metadata: {
            ...(notes ? { hr_notes: notes } : {}),
            docuseal_template_id: template.docuseal_template_id,
            docuseal_external_id: signedDoc.id,
          },
        })
        .eq("id", signedDoc.id);

      if (submissionUpdateError) {
        throw submissionUpdateError;
      }
    }

    // Update application status and contract_offer_id
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "offer_sent",
        contract_offer_id: signedDoc.id,
      })
      .eq("id", applicationId);

    if (updateError) {
      throw updateError;
    }

    const jobTitle = job?.title || "the position";

    // Create notification for candidate
    void Promise.resolve(
      supabase.from("notifications").insert({
        recipient_id: application.candidate_id,
        type: "offer_letter",
        title: "Job Offer Received 🎉",
        body: `You have received a job offer for ${jobTitle}. Please review and sign the contract.`,
        action_url: `/applications/${applicationId}`,
      })
    ).catch((err: unknown) => {
      console.error("Failed to insert offer notification:", err);
    });

    revalidatePath(`/jobs/manage/${application.job_posting_id}/applicants`);
    revalidatePath(`/applications/${applicationId}`);

    return {
      success: true,
      signedDocumentId: signedDoc.id,
      docusealSigningUrl,
    };
  } catch (error) {
    console.error("Job offer sending error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send job offer",
    };
  }
}

export async function withdrawJobOffer(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const reason = formData.get("reason") as string | null;

  if (!applicationId) {
    return { success: false, error: "Missing application ID" };
  }

  try {
    // Verify application exists
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status, contract_offer_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    // Verify HR user owns the job posting
    const { data: job } = await supabase
      .from("job_postings")
      .select("id, created_by")
      .eq("id", application.job_posting_id)
      .single();

    if (!job || job.created_by !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!application.contract_offer_id) {
      return { success: false, error: "No active offer for this application" };
    }

    // Update signed_documents status
    const { error: updateDocError } = await supabase
      .from("signed_documents")
      .update({
        status: "expired",
        metadata: reason ? { withdrawn_reason: reason } : {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.contract_offer_id);

    if (updateDocError) {
      throw updateDocError;
    }

    // Revert application status to interviewed
    const { error: updateAppError } = await supabase
      .from("applications")
      .update({
        status: "interviewed",
        contract_offer_id: null,
      })
      .eq("id", applicationId);

    if (updateAppError) {
      throw updateAppError;
    }

    // Notify candidate
    void Promise.resolve(
      supabase.from("notifications").insert({
        recipient_id: application.candidate_id,
        type: "application_status_changed",
        title: "Job Offer Withdrawn",
        body: reason ? `Your job offer has been withdrawn. Reason: ${reason}` : "Your job offer has been withdrawn.",
        action_url: `/applications/${applicationId}`,
      })
    ).catch((err: unknown) => {
      console.error("Failed to insert withdrawal notification:", err);
    });

    revalidatePath(`/jobs/manage/${application.job_posting_id}/applicants`);
    revalidatePath(`/applications/${applicationId}`);

    return { success: true };
  } catch (error) {
    console.error("Job offer withdrawal error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to withdraw job offer",
    };
  }
}

export async function acceptJobOffer(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const signatureData = String(formData.get("signature_data") ?? "").trim();

  if (!applicationId) {
    return { success: false, error: "Missing application ID" };
  }

  if (!signatureData) {
    return { success: false, error: "Signature is required" };
  }

  try {
    // Verify application exists and belongs to candidate
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status, contract_offer_id")
      .eq("id", applicationId)
      .eq("candidate_id", user.id)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.status !== "offer_sent") {
      return { success: false, error: "No pending offer for this application" };
    }

    // Update signed_documents status
    const { error: updateDocError } = await supabase
      .from("signed_documents")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signed_values: {
          signature_data: signatureData,
          signed_via: "canvas",
        },
      })
      .eq("id", application.contract_offer_id);

    if (updateDocError) {
      throw updateDocError;
    }

    // Update application status to hired
    const { error: updateAppError } = await supabase
      .from("applications")
      .update({
        status: "hired",
      })
      .eq("id", applicationId);

    if (updateAppError) {
      throw updateAppError;
    }

    // Get HR user to notify them
    const { data: jobData } = await supabase
      .from("job_postings")
      .select("created_by, title")
      .eq("id", application.job_posting_id)
      .single();

    if (jobData?.created_by) {
      void Promise.resolve(
        supabase.from("notifications").insert({
          recipient_id: jobData.created_by,
          type: "application_status_changed",
          title: "Offer Accepted ✅",
          body: `Candidate has accepted the job offer for ${jobData.title}.`,
          action_url: `/jobs/manage/${application.job_posting_id}/applicants`,
        })
      ).catch((err: unknown) => {
        console.error("Failed to insert acceptance notification:", err);
      });
    }

    revalidatePath(`/applications/${applicationId}`);

    return { success: true };
  } catch (error) {
    console.error("Job offer acceptance error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to accept job offer",
    };
  }
}

export async function declineJobOffer(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const applicationId = formData.get("application_id") as string;
  const reason = formData.get("reason") as string | null;

  if (!applicationId) {
    return { success: false, error: "Missing application ID" };
  }

  try {
    // Verify application exists and belongs to candidate
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id, job_posting_id, status, contract_offer_id")
      .eq("id", applicationId)
      .eq("candidate_id", user.id)
      .single();

    if (appError || !application) {
      return { success: false, error: "Application not found" };
    }

    if (application.status !== "offer_sent") {
      return { success: false, error: "No pending offer for this application" };
    }

    // Update signed_documents status
    const { error: updateDocError } = await supabase
      .from("signed_documents")
      .update({
        status: "declined",
        metadata: reason ? { decline_reason: reason } : {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.contract_offer_id);

    if (updateDocError) {
      throw updateDocError;
    }

    // Revert application status to interviewed
    const { error: updateAppError } = await supabase
      .from("applications")
      .update({
        status: "interviewed",
        contract_offer_id: null,
      })
      .eq("id", applicationId);

    if (updateAppError) {
      throw updateAppError;
    }

    // Get HR user to notify them
    const { data: jobData } = await supabase
      .from("job_postings")
      .select("created_by, title")
      .eq("id", application.job_posting_id)
      .single();

    if (jobData?.created_by) {
      void Promise.resolve(
        supabase.from("notifications").insert({
          recipient_id: jobData.created_by,
          type: "application_status_changed",
          title: "Offer Declined ❌",
          body: reason
            ? `Candidate declined the offer for ${jobData.title}. Reason: ${reason}`
            : `Candidate declined the offer for ${jobData.title}.`,
          action_url: `/jobs/manage/${application.job_posting_id}/applicants`,
        })
      ).catch((err: unknown) => {
        console.error("Failed to insert decline notification:", err);
      });
    }

    revalidatePath(`/applications/${applicationId}`);

    return { success: true };
  } catch (error) {
    console.error("Job offer decline error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to decline job offer",
    };
  }
}
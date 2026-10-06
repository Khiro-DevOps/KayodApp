"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { InterviewType, MeetingType } from "@/lib/types";
import { resolveCompanyLogoUrlForUser } from "@/lib/company-logos";
import { createDocusealSubmission } from "@/lib/docuseal";
import { createSignedDocumentPlaceholderWithTemplateFallback } from "@/lib/contract-template-compat";

export async function getOfficeBranches() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, data: [] };
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return { success: false, data: [] };
  const { data, error } = await supabase.from("office_branches").select("id, name, address").eq("tenant_id", profile.tenant_id).order("name");
  return { success: !error, data: data ?? [] };
}

function createWebrtcRoom() {
  const roomName = `kayod-interview-${crypto.randomUUID()}`;

  return {
    // Local application path for joining (used in notifications). The real join uses the room name for signaling.
    url: `/hr/interviews/${roomName}/room`,
    name: roomName,
  };
}

export async function scheduleInterviewProposal(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!actor || !["hr", "hr_manager", "admin"].includes(String(actor.role))) {
    return { success: false, error: "HR permissions required" };
  }

  const supabaseAdmin = getAdminClient();

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
  const rawMeetingType = String(formData.get("meeting_type") ?? "").toLowerCase();
  const meetingType: MeetingType = rawMeetingType === "in_person" || rawMeetingType === "hybrid" ? rawMeetingType : "online";
  const officeBranchId = String(formData.get("office_branch_id") ?? "").trim() || null;

  if (!rawApplicationId || !jobId || !scheduledAt) {
    return { success: false, error: "Missing required fields" };
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { success: false, error: "Duration must be a positive number of minutes" };
  }

  if (offeredModes.length === 0) {
    return { success: false, error: "Please choose at least one interview availability option" };
  }

  if (["in_person", "hybrid"].includes(meetingType) && !officeBranchId) {
    return { success: false, error: "Office branch is required for in-person or hybrid interviews" };
  }

  try {
    type ResolvedApplication = {
      id: string;
      applicant_id: string;
      job_id: string;
    };

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("job_applications")
      .select("id, job_id, applicant_id")
      .eq("id", rawApplicationId)
      .maybeSingle();

    if (applicationError) {
      throw applicationError;
    }

    if (!application || application.job_id !== jobId) {
      return {
        success: false,
        error: "Application not found for this job. Refresh the page and try again.",
      };
    }

    const applicationId = application.id;
    let officeBranchName: string | null = null;
    if (["in_person", "hybrid"].includes(meetingType)) {
      const { data: branch } = await supabaseAdmin.from("office_branches").select("id, name, address").eq("id", officeBranchId).eq("tenant_id", (await supabaseAdmin.from("job_postings").select("tenant_id").eq("id", application.job_id).single()).data?.tenant_id ?? "").maybeSingle();
      if (!branch) return { success: false, error: "Office branch is not in the interview tenant" };
      officeBranchName = `${branch.name}${branch.address ? `, ${branch.address}` : ""}`;
    }

    const { data: app } = await supabaseAdmin
      .from("job_postings")
      .select("title")
      .eq("id", application.job_id)
      .single();

    const jobTitle = app?.title || "the position";

    const interviewType: InterviewType = offeredModes[0];

    const hrOfficeAddress = offeredModes.includes("in_person") ? locationDetails : null;

    const { error: appUpdateError } = await supabaseAdmin
      .from("job_applications")
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
        const { error: fallbackAppUpdateError } = await supabaseAdmin
          .from("job_applications")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", applicationId);

        if (fallbackAppUpdateError) {
          throw fallbackAppUpdateError;
        }
      } else {
        throw appUpdateError;
      }
    }

    const scheduledAtTimestamp = new Date(scheduledAt).toISOString();
    const room = meetingType === "online" || meetingType === "hybrid" ? createWebrtcRoom() : null;
    const meetingLink = meetingType === "online" || meetingType === "hybrid" ? room?.url : null;
    const meetingRoomName = room?.name ?? null;

    const payload = {
      applicant_id: application.applicant_id,
      type: interviewType,
      scheduled_at: scheduledAtTimestamp,
      duration_minutes: durationMinutes,
      meeting_link: meetingLink,
      location: meetingType === "in_person" || meetingType === "hybrid" ? officeBranchName : null,
    };

    const { data: existingInterview } = await supabaseAdmin
      .from("interview_schedules")
      .select("id, status")
      .eq("application_id", applicationId)
      .maybeSingle();

    let interviewId: string;

    const backgroundTasks: Promise<unknown>[] = [];

    if (existingInterview) {
      const { data, error } = await supabaseAdmin
        .from("interview_schedules")
        .update({
          status: "scheduled",
          scheduled_at: payload.scheduled_at,
          duration_minutes: payload.duration_minutes,
          meeting_link: payload.meeting_link,
          room_name: meetingRoomName,
          video_provider: meetingType === "online" || meetingType === "hybrid" ? "webrtc" : null,
          meeting_type: meetingType,
          office_branch_id: ["in_person", "hybrid"].includes(meetingType) ? officeBranchId : null,
          interview_notes: notes?.trim() || "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInterview.id)
        .select("id, scheduled_at")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;

      const rescheduleTarget =
        interviewType === "online"
          ? `Meeting link: ${meetingLink}`
          : `In-Person at ${officeBranchName}`;

      backgroundTasks.push(
        Promise.resolve(
          supabaseAdmin.from("notifications").insert({
            recipient_id: application.applicant_id,
            type: "interview_rescheduled",
            title: "Interview Rescheduled 🔄",
            body: `Your interview for ${jobTitle} has been rescheduled. ${rescheduleTarget}`,
            action_url: "/applicant/applications",
          })
        ).then(() => null).catch((err: unknown) => {
          console.error("Failed to insert rescheduled notification:", err);
        })
      );
    } else {
      const { data, error } = await supabaseAdmin
        .from("interview_schedules")
        .insert({
          application_id: application.id,
          job_id: application.job_id,
          applicant_id: application.applicant_id,
          interviewer_id: user.id,
          proposed_slots: [],
          scheduled_at: scheduledAtTimestamp,
          duration_minutes: durationMinutes || 60,
          status: "scheduled",
          meeting_link: meetingLink,
          video_provider: meetingType === "online" || meetingType === "hybrid" ? "webrtc" : null,
          room_name: meetingRoomName,
          meeting_type: meetingType,
          office_branch_id: ["in_person", "hybrid"].includes(meetingType) ? officeBranchId : null,
          interview_notes: notes?.trim() || "",
        })
        .select("id, scheduled_at")
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
          : `In-Person at ${officeBranchName}`;

      backgroundTasks.push(
        Promise.resolve(
          supabaseAdmin.from("notifications").insert({
            recipient_id: application.applicant_id,
            type: "interview_scheduled",
            title: "Interview Scheduled",
            body: `Your interview for ${jobTitle} is scheduled. ${invitationTarget}`,
            action_url: "/applicant/applications",
          })
        ).then(() => null).catch((err: unknown) => {
          console.error("Failed to insert scheduled notification:", err);
        })
      );
    }

    await supabaseAdmin
      .from("job_applications")
      .update({ status: "interview", status_updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    try {
      revalidatePath(`/hr/jobs/${jobId}/applicants`);
      revalidatePath(`/applications/${applicationId}`);
    } catch (err) {
      console.error("Revalidation error:", err);
    }

    try {
      await Promise.allSettled(backgroundTasks);
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
          action_url: `/hr/interviews`,
        })
      ).catch((err: unknown) => {
        console.error("Failed to insert preference notification:", err);
      });
    }

    revalidatePath(`/hr/interviews/respond/${applicationId}`);

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
    const signedDoc = await createSignedDocumentPlaceholderWithTemplateFallback(supabase, {
      applicationId,
      jobPostingId: application.job_posting_id,
      docusealTemplateId: template.docuseal_template_id,
      createdBy: job.created_by,
      signingMethod: signingMethod as "digital" | "in_person",
      status: "sent",
      metadata: {
        ...(notes ? { hr_notes: notes } : {}),
        docuseal_template_id: template.docuseal_template_id,
      },
    });

    let docusealSigningUrl: string | null = null;

    if (signingMethod === "digital") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
      const candidateName = [candidateProfile?.first_name, candidateProfile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Candidate";

      const companyLogoUrl = await resolveCompanyLogoUrlForUser(user.id);
      const submission = await createDocusealSubmission({
        templateId: template.docuseal_template_id,
        submitterName: candidateName,
        submitterEmail: candidateEmail!,
        externalId: signedDoc.signedDocumentId,
        sendEmail: true,
        redirectUrl: `${appUrl}/applications/${applicationId}`,
        companyLogoUrl,
      });

      docusealSigningUrl = submission.signingUrl;

      const { error: submissionUpdateError } = await supabase
        .from("signed_documents")
        .update({
          docuseal_submitter_id: submission.submitterId ?? signedDoc.signedDocumentId,
          docuseal_submission_url: submission.signingUrl,
          metadata: {
            ...(notes ? { hr_notes: notes } : {}),
            docuseal_template_id: template.docuseal_template_id,
            docuseal_external_id: signedDoc.signedDocumentId,
          },
        })
        .eq("id", signedDoc.signedDocumentId);

      if (submissionUpdateError) {
        throw submissionUpdateError;
      }
    }

    // Update application status and contract_offer_id
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "offer_sent",
        contract_offer_id: signedDoc.signedDocumentId,
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

    revalidatePath(`/hr/jobs/${application.job_posting_id}/applicants`);
    revalidatePath(`/applications/${applicationId}`);

    return {
      success: true,
      signedDocumentId: signedDoc.signedDocumentId,
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

    revalidatePath(`/hr/jobs/${application.job_posting_id}/applicants`);
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
          action_url: `/hr/jobs/${application.job_posting_id}/applicants`,
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
          action_url: `/hr/jobs/${application.job_posting_id}/applicants`,
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
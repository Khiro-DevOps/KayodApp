"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { InterviewType } from "@/lib/types";

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
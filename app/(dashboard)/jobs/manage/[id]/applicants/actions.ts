"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { InterviewType } from "@/lib/types";

async function createDailyRoom(applicationId: string) {
  if (!process.env.DAILY_API_KEY) {
    throw new Error("Daily.co API key is not configured");
  }

  const roomName = `kayod-interview-${applicationId.slice(0, 8)}-${Date.now()}`;
  const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      name: roomName,
      properties: {
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        enable_chat: true,
        enable_screenshare: true,
      },
    }),
  });

  if (!dailyRes.ok) {
    throw new Error("Failed to create Daily.co meeting room");
  }

  const room = await dailyRes.json();
  if (!room?.url || !room?.name) {
    throw new Error("Daily.co room response is missing required fields");
  }

  return {
    url: room.url as string,
    name: room.name as string,
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
    // Resolve the target application in a schema-tolerant way.
    // Some deployments still have legacy fields and some callers may pass candidate_id.
    type ResolvedApplication = {
      id: string;
      candidate_id: string;
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

    const selectedMode = application.selected_mode ?? null;
    const interviewType: InterviewType =
      selectedMode && offeredModes.includes(selectedMode)
        ? selectedMode
        : offeredModes[0];

    const hrOfficeAddress = offeredModes.includes("in_person") ? locationDetails : null;

    // Persist HR interview availability on the application when schema supports it.
    // Older deployments may not yet have hr_offered_modes / hr_office_address columns.
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
        // Retry with a minimal no-op safe update target used later in the flow.
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
      const room = await createDailyRoom(applicationId);
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

    // Check if interview already exists for this application
    const { data: existingInterview } = await supabase
      .from("interviews")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();

    let interviewId: string;

    if (existingInterview) {
      // Update existing interview
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
          video_provider: interviewType === "online" ? "daily.co" : null,
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
    } else {
      // Create new interview
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
          video_provider: interviewType === "online" ? "daily.co" : null,
          interviewer_notes: notes?.trim() || null,
        })
        .select("id, interview_type, scheduled_at")
        .single();

      if (error) {
        throw error;
      }
      interviewId = data.id;
    }

    // Send notification to candidate
    const { data: app } = await supabase
      .from("applications")
      .select("job_postings(title)")
      .eq("id", applicationId)
      .single();

    const jobTitle = (app?.job_postings as any)?.title || "the position";

    const invitationTarget =
      interviewType === "online"
        ? `Meeting link: ${meetingLink}`
        : `Location: ${hrOfficeAddress}`;

    await supabase.from("notifications").insert({
      recipient_id: application.candidate_id,
      type: "interview_scheduled",
      title: "Interview Invitation 🎉",
      body: `Your interview for ${jobTitle} is scheduled. ${invitationTarget}`,
      action_url: `/interviews`,
    });

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "interview_scheduled" })
      .eq("id", applicationId);

    revalidatePath(`/jobs/manage/${jobId}/applicants`);
    revalidatePath(`/applications/${applicationId}`);

    return {
      success: true,
      interviewId,
      payload,
    };
  } catch (error) {
    console.error("Interview scheduling error:", error);
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
    // Fetch interview for this application
    const { data: interview } = await supabase
      .from("interviews")
      .select("id, application_id")
      .eq("application_id", applicationId)
      .single();

    if (!interview) {
      return { success: false, error: "Interview not found" };
    }

    // Update candidate's preference
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

    // Send notification to HR
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const candidateName = profile
      ? `${profile.first_name} ${profile.last_name}`
      : "Candidate";

    await supabase.from("notifications").insert({
      recipient_id: interview.application_id, // This should be HR's ID, need to fix
      type: "application_status_changed",
      title: "Interview Preference Submitted",
      body: `${candidateName} has submitted their interview format preference.`,
      action_url: `/jobs/manage/[id]/applicants/${applicationId}`,
    });

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

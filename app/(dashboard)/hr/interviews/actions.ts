"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InterviewType } from "@/lib/types";

function createWebrtcRoom(applicationId: string) {
  const roomName = `kayod-interview-${applicationId.slice(0, 8)}-${Date.now()}`;
  return {
    url: `/hr/interviews/${roomName}/room`,
    name: roomName,
  };
}

export async function scheduleInterviewProposal(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const rawApplicationId = String(formData.get("application_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const scheduledAt = formData.get("scheduled_at") as string;
  const durationMinutes = Number(formData.get("duration_minutes") as string) || 60;
  const notes = formData.get("notes") as string;
  const timezone = formData.get("timezone") as string;
  const rawModes = formData.getAll("available_modes").map(String).filter((v): v is InterviewType => v === "online" || v === "in_person");
  const offeredModes = Array.from(new Set(rawModes));
  const locationDetails = (formData.get("location_details") as string | null)?.trim() || null;

  if (!rawApplicationId || !jobId || !scheduledAt) return { success: false, error: "Missing required fields" };
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return { success: false, error: "Duration must be positive" };
  if (offeredModes.length === 0) return { success: false, error: "Please choose at least one interview availability option" };
  if (offeredModes.includes("in_person") && !locationDetails) return { success: false, error: "Location required for in-person" };

  try {
    const { data: application } = await supabase.from("applications").select("*").eq("id", rawApplicationId).single();
    if (!application) return { success: false, error: "Application not found" };

    const { data: appData } = await supabase.from("applications").select("job_postings(title)").eq("id", application.id).single();
    const jobTitle = (appData?.job_postings as any)?.title || "the position";

    const interviewType: InterviewType = application.selected_mode && offeredModes.includes(application.selected_mode) ? application.selected_mode : offeredModes[0];
    const hrOfficeAddress = offeredModes.includes("in_person") ? locationDetails : null;

    await supabase.from("applications").update({ hr_offered_modes: offeredModes, hr_office_address: hrOfficeAddress }).eq("id", application.id);

    let meetingLink = null;
    let meetingRoomName = null;
    if (interviewType === "online") {
      const room = createWebrtcRoom(application.id);
      meetingLink = room.url;
      meetingRoomName = room.name;
    }

    const { data: existingInterview } = await supabase.from("interviews").select("id").eq("application_id", application.id).maybeSingle();

    if (existingInterview) {
      await supabase.from("interviews").update({
        status: "scheduled",
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: durationMinutes,
        timezone,
        interview_type: interviewType,
        location_address: interviewType === "in_person" ? hrOfficeAddress : null,
        video_room_url: meetingLink,
        video_room_name: meetingRoomName,
        video_provider: interviewType === "online" ? "webrtc" : null,
        interviewer_notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", existingInterview.id);
    } else {
      await supabase.from("interviews").insert({
        application_id: application.id,
        scheduled_by: user.id,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: durationMinutes,
        timezone,
        interview_type: interviewType,
        status: "scheduled",
        location_address: interviewType === "in_person" ? hrOfficeAddress : null,
        video_room_url: meetingLink,
        video_room_name: meetingRoomName,
        video_provider: interviewType === "online" ? "webrtc" : null,
        interviewer_notes: notes?.trim() || null,
      });
    }

    await supabase.from("applications").update({ status: "interview_scheduled" }).eq("id", application.id);

    revalidatePath("/hr/interviews");
    revalidatePath("/hr/applicants");

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to schedule" };
  }
}

async function verifyHR(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", userId).single();
  return profile && ["hr_manager", "admin"].includes(profile.role);
}

export async function scheduleInterview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/hr");

  const applicationId   = formData.get("application_id") as string;
  const interviewType   = formData.get("interview_type") as string;
  const scheduledAt     = formData.get("scheduled_at") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string) || 60;
  const locationAddress = formData.get("location_address") as string | null;
  const locationNotes   = formData.get("location_notes") as string | null;

  if (!applicationId || !scheduledAt) redirect("/hr/interviews");

  let videoRoomUrl  = null;
  let videoRoomName = null;

  // WebRTC Room Generation (local room id used for signaling)
  if (interviewType === "online") {
    videoRoomName = `kayod-${applicationId.slice(0, 8)}-${Date.now()}`;
    videoRoomUrl = `/hr/interviews/${videoRoomName}/room`;
  }

  const { error } = await supabase.from("interviews").insert({
    application_id:   applicationId,
    scheduled_by:     user.id,
    interview_type:   interviewType,
    status:           "scheduled",
    scheduled_at:     new Date(scheduledAt).toISOString(),
    duration_minutes: durationMinutes,
    location_address: locationAddress || null,
    location_notes:   locationNotes || null,
    video_room_url:   videoRoomUrl,
    video_room_name:  videoRoomName,
    video_provider:   interviewType === "online" ? "webrtc" : null,
  });

  if (error) redirect(`/hr/interviews?error=${encodeURIComponent(error.message)}`);

  await supabase
    .from("applications")
    .update({ status: "interview_scheduled" })
    .eq("id", applicationId);

  revalidatePath("/hr/interviews");
  revalidatePath("/hr/applicants");
  revalidatePath("/hr");
  redirect("/hr/interviews");
}

export async function cancelInterview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/hr");

  const interviewId = formData.get("interview_id") as string;
  if (!interviewId) redirect("/hr/interviews");

  // WebRTC rooms are ephemeral and do not require external deletion.
  await supabase
    .from("interviews")
    .update({ status: "cancelled" })
    .eq("id", interviewId);

  revalidatePath("/hr/interviews");
  redirect("/hr/interviews");
}

export async function confirmInterviewDone(interviewId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Unauthorized" };
  if (!await verifyHR(supabase, user.id)) return { success: false, error: "Unauthorized" };

  const admin = getAdminClient();

  const { data: interview, error: interviewError } = await admin
    .from("interviews")
    .select("application_id, hr_notes")
    .eq("id", interviewId)
    .single();

  if (interviewError || !interview) {
    return { success: false, error: "Interview not found" };
  }

  if (!interview.application_id) {
    return { success: false, error: "Interview not found" };
  }

  const { error: updateInterviewError } = await admin
    .from("interviews")
    .update({ status: "completed" })
    .eq("id", interviewId);

  if (updateInterviewError) {
    return { success: false, error: updateInterviewError.message };
  }

  const { error: upsertNotesError } = await admin
    .from("interview_notes")
    .upsert(
      {
        interview_id: interviewId,
        application_id: interview.application_id,
        created_by: user.id,
        general_notes: interview.hr_notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interview_id" }
    );

  if (upsertNotesError) {
    return { success: false, error: upsertNotesError.message };
  }

  const { error: updateApplicationError } = await admin
    .from("applications")
    .update({ status: "interviewed" })
    .eq("id", interview.application_id)
    .in("status", ["interview_scheduled"]);

  if (updateApplicationError) {
    return { success: false, error: updateApplicationError.message };
  }

  revalidatePath("/hr/interviews");
  revalidatePath("/hr/applicants");

  return { success: true };
}

export async function updateInterviewPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const interviewId = formData.get("interview_id") as string;
  const interviewType = formData.get("interview_type") as string;

  if (!interviewId || !interviewType) redirect("/hr/interviews");

  const { data: interview } = await supabase
    .from("interviews")
    .select(`id, applications ( candidate_id )`)
    .eq("id", interviewId)
    .single();

  if (!interview) redirect("/hr/interviews");

  const app = interview.applications as unknown as { candidate_id: string };
  if (app.candidate_id !== user.id) redirect("/hr/interviews");

  let videoRoomUrl = null;
  let videoRoomName = null;

  if (interviewType === "online") {
    videoRoomName = `kayod-${interviewId.slice(0, 8)}-${Date.now()}`;
    videoRoomUrl = `https://meet.jit.si/${videoRoomName}`;
  }

  const { error } = await supabase
    .from("interviews")
    .update({
      interview_type: interviewType,
      video_room_url: videoRoomUrl,
      video_room_name: videoRoomName,
      video_provider: interviewType === "online" ? "jitsi" : null,
    })
    .eq("id", interviewId);

  if (error) redirect(`/hr/interviews?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/hr/interviews");
  redirect("/hr/interviews");
}
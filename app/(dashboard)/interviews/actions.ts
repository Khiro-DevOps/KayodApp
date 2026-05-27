"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function verifyHR(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", userId).single();
  return profile && ["hr_manager", "admin"].includes(profile.role);
}

export async function scheduleInterview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const applicationId   = formData.get("application_id") as string;
  const interviewType   = formData.get("interview_type") as string;
  const scheduledAt     = formData.get("scheduled_at") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string) || 60;
  const locationAddress = formData.get("location_address") as string | null;
  const locationNotes   = formData.get("location_notes") as string | null;

  if (!applicationId || !scheduledAt) redirect("/interviews");

  let videoRoomUrl  = null;
  let videoRoomName = null;

  // WebRTC Room Generation (local room id used for signaling)
  if (interviewType === "online") {
    videoRoomName = `kayod-${applicationId.slice(0, 8)}-${Date.now()}`;
    videoRoomUrl = `/interviews/${videoRoomName}/room`;
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

  if (error) redirect(`/interviews?error=${encodeURIComponent(error.message)}`);

  await supabase
    .from("applications")
    .update({ status: "interview_scheduled" })
    .eq("id", applicationId);

  revalidatePath("/interviews");
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  redirect("/interviews");
}

export async function cancelInterview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const interviewId = formData.get("interview_id") as string;
  if (!interviewId) redirect("/interviews");

  // WebRTC rooms are ephemeral and do not require external deletion.
  await supabase
    .from("interviews")
    .update({ status: "cancelled" })
    .eq("id", interviewId);

  revalidatePath("/interviews");
  redirect("/interviews");
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

  revalidatePath("/interviews");
  revalidatePath("/applications");

  return { success: true };
}

export async function updateInterviewPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const interviewId = formData.get("interview_id") as string;
  const interviewType = formData.get("interview_type") as string;

  if (!interviewId || !interviewType) redirect("/interviews");

  const { data: interview } = await supabase
    .from("interviews")
    .select(`id, applications ( candidate_id )`)
    .eq("id", interviewId)
    .single();

  if (!interview) redirect("/interviews");

  const app = interview.applications as unknown as { candidate_id: string };
  if (app.candidate_id !== user.id) redirect("/interviews");

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

  if (error) redirect(`/interviews?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/interviews");
  redirect("/interviews");
}
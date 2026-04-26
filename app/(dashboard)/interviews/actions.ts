"use server";

import { createClient } from "@/lib/supabase/server";
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

  // Jitsi Room Generation (No API call needed)
  if (interviewType === "online") {
    videoRoomName = `kayod-${applicationId.slice(0, 8)}-${Date.now()}`;
    videoRoomUrl  = `https://meet.jit.si/${videoRoomName}`;
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
    video_provider:   interviewType === "online" ? "jitsi" : null,
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

  // Jitsi rooms don't need to be deleted via API call.
  await supabase
    .from("interviews")
    .update({ status: "cancelled" })
    .eq("id", interviewId);

  revalidatePath("/interviews");
  redirect("/interviews");
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
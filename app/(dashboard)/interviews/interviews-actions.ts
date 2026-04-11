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

  // Create Daily.co room for online interviews
  if (interviewType === "online" && process.env.DAILY_API_KEY) {
    try {
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
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24h
            enable_chat: true,
            enable_screenshare: true,
          },
        }),
      });
      if (dailyRes.ok) {
        const room = await dailyRes.json();
        videoRoomUrl  = room.url;
        videoRoomName = room.name;
      }
    } catch {
      // If Daily.co fails, continue without video room
    }
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
    video_provider:   interviewType === "online" ? "daily.co" : null,
  });

  if (error) redirect(`/interviews?error=${encodeURIComponent(error.message)}`);

  // Update application status
  await supabase
    .from("applications")
    .update({ status: "interview_scheduled" })
    .eq("id", applicationId);

  // Notification is auto-fired by DB trigger

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

  // Delete Daily.co room if exists
  const { data: interview } = await supabase
    .from("interviews")
    .select("video_room_name")
    .eq("id", interviewId)
    .single();

  if (interview?.video_room_name && process.env.DAILY_API_KEY) {
    await fetch(`https://api.daily.co/v1/rooms/${interview.video_room_name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    }).catch(() => {});
  }

  await supabase
    .from("interviews")
    .update({ status: "cancelled" })
    .eq("id", interviewId);

  revalidatePath("/interviews");
  redirect("/interviews");
}

export async function completeInterview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!await verifyHR(supabase, user.id)) redirect("/dashboard");

  const interviewId = formData.get("interview_id") as string;
  const notes       = formData.get("interviewer_notes") as string | null;
  const score       = formData.get("interview_score") as string | null;

  await supabase
    .from("interviews")
    .update({
      status:             "completed",
      interviewer_notes:  notes || null,
      interview_score:    score ? parseInt(score) : null,
    })
    .eq("id", interviewId);

  // Update application status
  const { data: interview } = await supabase
    .from("interviews")
    .select("application_id")
    .eq("id", interviewId)
    .single();

  if (interview?.application_id) {
    await supabase
      .from("applications")
      .update({ status: "interviewed" })
      .eq("id", interview.application_id);
  }

  revalidatePath("/interviews");
  revalidatePath("/applications");
  redirect("/interviews");
}

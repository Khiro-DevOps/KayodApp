"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateApplicationEvaluation(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const newStatus = formData.get("status") as string | null;
  const hrNotes = formData.get("hr_notes") as string | null;

  if (!applicationId) {
    throw new Error("Application ID is required");
  }

  // Verify the user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  // Update application
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (newStatus) {
    updates.status = newStatus;
  }

  if (hrNotes !== null) {
    updates.hr_notes = hrNotes;
  }

  const { error } = await supabase
    .from("applications")
    .update(updates)
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to update application: ${error.message}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function moveToInterview(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const interviewType = formData.get("interview_type") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string, 10) || 60;
  const timezone = formData.get("timezone") as string;
  const locationAddress = formData.get("location_address") as string | null;
  const locationNotes = formData.get("location_notes") as string | null;
  const videoRoomName = formData.get("video_room_name") as string | null;

  if (!applicationId || !scheduledAt || !interviewType) {
    throw new Error("Missing required interview details");
  }

  // Verify the user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  // Update application status to interview_scheduled
  const { error: updateError } = await supabase
    .from("applications")
    .update({
      status: "interview_scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(`Failed to update application: ${updateError.message}`);
  }

  // Create interview record
  const interviewData: Record<string, any> = {
    application_id: applicationId,
    scheduled_by: user.id,
    interview_type: interviewType,
    status: "scheduled",
    scheduled_at: scheduledAt,
    duration_minutes: durationMinutes,
    timezone: timezone || "Asia/Manila",
  };

  if (interviewType === "in_person") {
    interviewData.location_address = locationAddress;
    interviewData.location_notes = locationNotes;
  } else if (interviewType === "online") {
    interviewData.video_room_name = videoRoomName;
    // In a real app, you'd generate a Daily.co room URL here
  }

  const { error: createError } = await supabase
    .from("interviews")
    .insert(interviewData);

  if (createError) {
    throw new Error(`Failed to create interview: ${createError.message}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function rejectCandidate(applicationId: string, reason?: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify the user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("applications")
    .update({
      status: "rejected",
      hr_notes: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to reject candidate: ${error.message}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function offerPosition(applicationId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify the user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("applications")
    .update({
      status: "offer_sent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to send offer: ${error.message}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function markAsHired(applicationId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify the user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("applications")
    .update({
      status: "hired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to mark as hired: ${error.message}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

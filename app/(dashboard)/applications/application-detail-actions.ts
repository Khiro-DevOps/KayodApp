"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { InterviewType } from "@/lib/types";

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
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

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

export async function configureInterviewAvailability(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  const officeAddress = (formData.get("hr_office_address") as string | null)?.trim() || null;
  const offeredModes = formData
    .getAll("hr_offered_modes")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => v === "online" || v === "in_person") as InterviewType[];

  if (!applicationId) {
    throw new Error("Application ID is required");
  }

  if (offeredModes.length === 0) {
    throw new Error("Select at least one interview mode");
  }

  if (offeredModes.includes("in_person") && !officeAddress) {
    throw new Error("Office address is required when in-person interviews are enabled");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hr_manager" && profile?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const { data: existing } = await supabase
    .from("applications")
    .select("id, candidate_id, status, selected_mode")
    .eq("id", applicationId)
    .single();

  if (!existing) {
    throw new Error("Application not found");
  }

  const nextSelectedMode =
    existing.selected_mode && offeredModes.includes(existing.selected_mode)
      ? existing.selected_mode
      : null;

  const { error: updateError } = await supabase
    .from("applications")
    .update({
      hr_offered_modes: offeredModes,
      hr_office_address: offeredModes.includes("in_person") ? officeAddress : null,
      selected_mode: nextSelectedMode,
      selected_mode_set_at: nextSelectedMode ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(`Failed to save interview availability: ${updateError.message}`);
  }

  const modeLabel = offeredModes
    .map((mode) => (mode === "online" ? "Online" : "In-Person"))
    .join(" or ");

  await supabase.from("notifications").insert({
    recipient_id: existing.candidate_id,
    type: "application_status_changed",
    title: "Interview format options updated",
    body: `HR has enabled ${modeLabel} interview format${offeredModes.length > 1 ? "s" : ""} for your application. Please confirm your preferred format.`,
    action_url: `/interviews/respond/${applicationId}`,
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/interviews/respond/${applicationId}`);
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
  const interviewData: Record<string, unknown> = {
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

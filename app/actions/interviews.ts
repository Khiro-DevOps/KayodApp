"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface TimeSlot {
  slot_id: string;
  start_time: string;
  end_time: string;
  status: "proposed" | "selected" | "declined";
}

export interface ScorecardPayload {
  rating: number; // 1-5
  strengths: string;
  weaknesses: string;
  private_notes: string;
}

export interface CreateInvitePayload {
  application_id: string;
  interviewer_id: string;
  slots: Array<{ start_time: string; end_time: string }>;
  meeting_link?: string;
}

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper to check for overlapping confirmed interview slots for an interviewer.
 */
async function hasInterviewerConflict(
  supabase: any,
  interviewerId: string,
  slots: Array<{ start_time: string; end_time: string }>
): Promise<boolean> {
  const { data: existingSchedules, error } = await supabase
    .from("interview_schedules")
    .select("selected_slot, status")
    .eq("interviewer_id", interviewerId)
    .eq("status", "scheduled");

  if (error || !existingSchedules) return false;

  for (const schedule of existingSchedules) {
    if (!schedule.selected_slot) continue;
    const existingStart = new Date(schedule.selected_slot.start_time).getTime();
    const existingEnd = new Date(schedule.selected_slot.end_time).getTime();

    for (const slot of slots) {
      const newStart = new Date(slot.start_time).getTime();
      const newEnd = new Date(slot.end_time).getTime();

      // Check overlap: newStart < existingEnd && newEnd > existingStart
      if (newStart < existingEnd && newEnd > existingStart) {
        return true;
      }
    }
  }

  return false;
}

/**
 * HR Action: Propose 1 to 3 time slots for an applicant interview.
 * Checks interviewer conflict, sets meeting link, updates application status to 'interview'.
 */
export async function createInterviewInvite(
  data: CreateInvitePayload
): Promise<ActionResponse> {
  try {
    const { application_id, interviewer_id, slots, meeting_link } = data;

    if (!application_id || !interviewer_id || !slots || slots.length < 1 || slots.length > 3) {
      return { success: false, error: "Please provide valid application, interviewer, and 1 to 3 time slots." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized: User not authenticated." };
    }

    // Verify HR permissions
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
      return { success: false, error: "Forbidden: HR permissions required." };
    }

    // Resolve the canonical application and derive all scheduling ownership from it.
    const { data: jobApp } = await supabase
      .from("job_applications")
      .select("id, job_id, applicant_id")
      .eq("id", application_id)
      .maybeSingle();

    if (!jobApp) {
      return { success: false, error: "Application record not found." };
    }

    // Conflict checking for interviewer
    const conflict = await hasInterviewerConflict(supabase, interviewer_id, slots);
    if (conflict) {
      return {
        success: false,
        error: "Conflict detected: The interviewer already has a confirmed interview overlapping with proposed time slots.",
      };
    }

    // Form proposed_slots JSONB array
    const proposedSlots: TimeSlot[] = slots.map((s, index) => ({
      slot_id: `slot_${Date.now()}_${index}`,
      start_time: s.start_time,
      end_time: s.end_time,
      status: "proposed",
    }));

    // Generate video meeting link if not provided
    const roomName = `kayod-interview-${crypto.randomUUID()}`;
    const dynamicMeetingLink = meeting_link || `https://meet.jit.si/${roomName}`;

    // Insert into interview_schedules
    const { data: invite, error: insertError } = await supabase
      .from("interview_schedules")
      .insert({
        application_id,
        interviewer_id,
        applicant_id: jobApp.applicant_id,
        proposed_slots: proposedSlots,
        job_id: jobApp.job_id,
        status: "proposed",
        room_name: roomName,
        meeting_link: dynamicMeetingLink,
        video_provider: "jitsi",
        interview_notes: "",
        scorecard: {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating interview schedule:", insertError);
      return { success: false, error: insertError.message || "Failed to create interview invitation." };
    }

    // Update only the canonical application table.
    await supabase
      .from("job_applications")
      .update({ status: "interview", status_updated_at: new Date().toISOString() })
      .eq("id", application_id);

    revalidatePath("/hr/interviews");
    revalidatePath("/applicant/interviews");

    return { success: true, data: invite };
  } catch (err: unknown) {
    console.error("Unexpected error in createInterviewInvite:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unknown error occurred." };
  }
}

/**
 * Applicant Action: Select 1 of the proposed time slots.
 */
export async function selectInterviewSlot(
  interviewId: string,
  selectedSlotId: string
): Promise<ActionResponse> {
  try {
    if (!interviewId || !selectedSlotId) {
      return { success: false, error: "Interview ID and Selected Slot ID are required." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized: User not authenticated." };
    }

    // Fetch interview schedule
    const { data: schedule, error: fetchError } = await supabase
      .from("interview_schedules")
      .select("*")
      .eq("id", interviewId)
      .single();

    if (fetchError || !schedule) {
      return { success: false, error: "Interview schedule not found." };
    }

    if (schedule.applicant_id !== user.id) {
      return { success: false, error: "Forbidden: You do not own this interview schedule." };
    }

    const proposedSlots: TimeSlot[] = schedule.proposed_slots || [];
    const targetSlot = proposedSlots.find((s) => s.slot_id === selectedSlotId);

    if (!targetSlot) {
      return { success: false, error: "Selected time slot not found in proposed options." };
    }

    // Update slot statuses
    const updatedSlots: TimeSlot[] = proposedSlots.map((s) => ({
      ...s,
      status: s.slot_id === selectedSlotId ? "selected" : "declined",
    }));

    const finalSelectedSlot: TimeSlot = { ...targetSlot, status: "selected" };

    const { error: updateError } = await supabase
      .from("interview_schedules")
      .update({
        proposed_slots: updatedSlots,
        selected_slot: finalSelectedSlot,
        scheduled_at: finalSelectedSlot.start_time,
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId);

    if (updateError) {
      console.error("Error confirming slot:", updateError);
      return { success: false, error: updateError.message || "Failed to confirm slot." };
    }

    revalidatePath("/applicant/interviews");
    revalidatePath("/hr/interviews");

    return { success: true };
  } catch (err: unknown) {
    console.error("Unexpected error in selectInterviewSlot:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unknown error occurred." };
  }
}

/**
 * Applicant Action: Request a reschedule with a reason.
 */
export async function requestReschedule(
  interviewId: string,
  reason: string
): Promise<ActionResponse> {
  try {
    if (!interviewId || !reason || !reason.trim()) {
      return { success: false, error: "Interview ID and a valid reschedule reason are required." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized: User not authenticated." };
    }

    const { data: schedule, error: fetchError } = await supabase
      .from("interview_schedules")
      .select("*")
      .eq("id", interviewId)
      .single();

    if (fetchError || !schedule) {
      return { success: false, error: "Interview schedule not found." };
    }

    if (schedule.applicant_id !== user.id) {
      return { success: false, error: "Forbidden: You do not own this interview schedule." };
    }

    const { error: updateError } = await supabase
      .from("interview_schedules")
      .update({
        status: "rescheduled",
        reschedule_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId);

    if (updateError) {
      console.error("Error requesting reschedule:", updateError);
      return { success: false, error: updateError.message || "Failed to submit reschedule request." };
    }

    revalidatePath("/applicant/interviews");
    revalidatePath("/hr/interviews");

    return { success: true };
  } catch (err: unknown) {
    console.error("Unexpected error in requestReschedule:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unknown error occurred." };
  }
}

/**
 * HR Action: Submit interview ratings and private notes into interviewer_scorecard.
 */
export async function submitScorecard(
  interviewId: string,
  scorecardData: ScorecardPayload
): Promise<ActionResponse> {
  try {
    const { rating, strengths, weaknesses, private_notes } = scorecardData;

    if (!interviewId || rating < 1 || rating > 5) {
      return { success: false, error: "Interview ID and rating (1-5) are required." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized: User not authenticated." };
    }

    // Verify HR status
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
      return { success: false, error: "Forbidden: Only HR users can submit interview scorecards." };
    }

    const scorecardObj = {
      rating,
      strengths: strengths ? strengths.trim() : "",
      weaknesses: weaknesses ? weaknesses.trim() : "",
      private_notes: private_notes ? private_notes.trim() : "",
      submitted_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("interview_schedules")
      .update({
        scorecard: scorecardObj,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId);

    if (updateError) {
      console.error("Error submitting scorecard:", updateError);
      return { success: false, error: updateError.message || "Failed to submit scorecard." };
    }

    revalidatePath("/hr/interviews");
    revalidatePath("/applicant/interviews");

    return { success: true };
  } catch (err: unknown) {
    console.error("Unexpected error in submitScorecard:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unknown error occurred." };
  }
}

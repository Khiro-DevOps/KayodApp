"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeMeetingType, type MeetingType } from "@/lib/meeting-type";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";
import {
  formatPhtConflictDate,
  formatPhtConflictTime,
  formatPhtDate,
  formatPhtTime,
  phtInputToUtcIso,
} from "@/lib/interview-date";
import {
  checkIntervalOverlap,
  extractBusyIntervalsFromRows,
  getNextAvailableSlot as getNextAvailableSlotHelper,
  type NextAvailableSlotResult,
} from "@/lib/interview-slots";

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
  duration_minutes?: number;
  meeting_link?: string;
  meeting_type?: MeetingType | string;
  office_branch_id?: string | null;
  notes?: string;
}

export async function getOfficeBranches(): Promise<{ success: boolean; data?: Array<{ id: string; name: string; address: string | null }>; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return { success: false, error: "Tenant not found" };
  const { data, error } = await supabase.from("office_branches").select("id, name, address").eq("tenant_id", profile.tenant_id).order("name");
  return error ? { success: false, error: error.message } : { success: true, data: data ?? [] };
}

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server action to get the next available slot for an interviewer.
 */
export async function getNextAvailableSlot(params: {
  interviewerId?: string | null;
  durationMinutes?: number | null;
  fromDate?: string | null;
  daysAhead?: number;
  skipWeekends?: boolean;
  excludeInterviewId?: string | null;
}): Promise<NextAvailableSlotResult> {
  const supabase = await createClient();
  return await getNextAvailableSlotHelper({
    ...params,
    supabaseClient: supabase,
  });
}

/**
 * Helper to check for overlapping interview slots for interviewer or applicant.
 * Uses shared extractBusyIntervalsFromRows and checkIntervalOverlap.
 * Overlap check: start < otherEnd && end > otherStart (touching ends are not overlaps).
 */
async function checkInterviewConflicts(
  supabase: any,
  interviewerId: string,
  applicantId: string,
  excludeApplicationId: string,
  slots: Array<{ start_time: string; end_time: string }>,
  excludeInterviewId?: string | null,
  currentTenantId?: string | null
): Promise<{ conflict: boolean; error?: string }> {
  let query = supabase
    .from("interview_schedules")
    .select("id, application_id, interviewer_id, applicant_id, status, scheduled_at, duration_minutes, proposed_slots, selected_slot, job_postings!interview_schedules_job_id_fkey(title, tenant_id)")
    .neq("application_id", excludeApplicationId)
    .not("status", "in", '("cancelled","completed")');

  if (excludeInterviewId) {
    query = query.neq("id", excludeInterviewId);
  }

  const { data: existingSchedules, error } = await query;

  if (error || !existingSchedules || !Array.isArray(existingSchedules)) return { conflict: false };

  // Filter for matching interviewer or applicant
  const relevantRows = existingSchedules.filter(
    (sched) => sched.interviewer_id === interviewerId || sched.applicant_id === applicantId
  );

  const busyIntervals = extractBusyIntervalsFromRows(relevantRows);

  for (const slot of slots) {
    const newStart = new Date(slot.start_time).getTime();
    const newEnd = new Date(slot.end_time).getTime();

    for (const interval of busyIntervals) {
      if (checkIntervalOverlap(newStart, newEnd, interval.start, interval.end)) {
        const isApplicantMatch = interval.row.applicant_id === applicantId;
        const fromTime = formatPhtConflictTime(interval.start);
        const toTime = formatPhtConflictTime(interval.end);
        const onDate = formatPhtConflictDate(interval.start);

        // Calculate next free time for the conflicted person
        let nextFreeText = "";
        try {
          const nextSlot = await getNextAvailableSlotHelper({
            interviewerId: isApplicantMatch ? null : interviewerId,
            applicantId: isApplicantMatch ? applicantId : null,
            fromDate: new Date(interval.end).toISOString(),
            daysAhead: 0,
            skipWeekends: true,
            supabaseClient: supabase,
          });
          if (nextSlot?.start_time) {
            const nextPhtDate = formatPhtDate(nextSlot.start_time);
            const nextPhtTime = formatPhtTime(nextSlot.start_time);
            nextFreeText = ` Next available free time: ${nextPhtDate} at ${nextPhtTime}.`;
          }
        } catch {
          // ignore next slot calculation errors
        }

        // Cross-tenant privacy: check if schedule belongs to another tenant
        const scheduleTenantId = (interval.row.job_postings as { tenant_id?: string } | null)?.tenant_id;
        const isCrossTenant = isApplicantMatch && Boolean(currentTenantId && scheduleTenantId && scheduleTenantId !== currentTenantId);

        if (isCrossTenant) {
          return {
            conflict: true,
            error: `Candidate already has another interview at this time.${nextFreeText ? ` Next free: ${nextFreeText.replace(" Next available free time: ", "").replace(".", "")}.` : ""}`,
          };
        }

        const person = isApplicantMatch ? "Candidate" : "Interviewer";
        const jobTitle = interval.row.job_postings?.title ? ` for "${interval.row.job_postings.title}"` : "";

        return {
          conflict: true,
          error: `Conflict detected: ${person} already has an interview scheduled${jobTitle} from ${fromTime} to ${toTime} on ${onDate}.${nextFreeText}`,
        };
      }
    }
  }

  return { conflict: false };
}

/**
 * HR Action: Propose 1 to 3 time slots for an applicant interview.
 * Checks interviewer conflict, sets meeting link, updates application status to 'interview'.
 */
export async function createInterviewInvite(
  data: CreateInvitePayload
): Promise<ActionResponse> {
  try {
    const { application_id, interviewer_id, slots, meeting_link, office_branch_id } = data;
    const meetingType = normalizeMeetingType(data.meeting_type);

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
      .select("id, job_id, applicant_id, job_postings!job_applications_job_id_fkey(tenant_id)")
      .eq("id", application_id)
      .maybeSingle();

    if (!jobApp) {
      return { success: false, error: "Application record not found." };
    }
    let branchDetails: string | null = null;
    if (meetingType === "in_person" || meetingType === "hybrid") {
      if (!office_branch_id) return { success: false, error: "Office branch required for in-person interviews." };
      const jobTenantId = (jobApp.job_postings as { tenant_id?: string } | null)?.tenant_id;
      if (!jobTenantId) {
        return { success: false, error: "Job tenant not found for application." };
      }
      const { data: branch } = await supabase
        .from("office_branches")
        .select("id, name, address")
        .eq("id", office_branch_id)
        .eq("tenant_id", jobTenantId)
        .maybeSingle();
      if (!branch) return { success: false, error: "Office branch is not in the interview tenant." };
      branchDetails = `${branch.name}${branch.address ? `, ${branch.address}` : ""}`;
    }

    // Check if an interview schedule already exists for this application
    const { data: existingInterview } = await supabase
      .from("interview_schedules")
      .select("id, status, reschedule_reason")
      .eq("application_id", application_id)
      .maybeSingle();

    if (existingInterview?.status === "completed") {
      return { success: false, error: "Completed interviews cannot be rescheduled." };
    }

    const durationMinutes =
      typeof data.duration_minutes === "number" && data.duration_minutes > 0
        ? data.duration_minutes
        : slots[0]?.start_time && slots[0]?.end_time
        ? Math.max(
            15,
            Math.round(
              (new Date(slots[0].end_time).getTime() - new Date(slots[0].start_time).getTime()) /
                60_000
            )
          )
        : DEFAULT_DURATION_MINUTES;

    // Convert local datetime / PHT inputs to UTC ISO
    const normalizedSlots = slots.map((s) => {
      const startIso = phtInputToUtcIso(s.start_time);
      const endIso = s.end_time
        ? phtInputToUtcIso(s.end_time)
        : new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
      return {
        start_time: startIso,
        end_time: endIso,
      };
    });

    const jobTenantId = (jobApp.job_postings as { tenant_id?: string } | null)?.tenant_id;

    // Conflict checking for interviewer & candidate (excluding current interview if rescheduling)
    const conflictCheck = await checkInterviewConflicts(
      supabase,
      interviewer_id,
      jobApp.applicant_id,
      application_id,
      normalizedSlots,
      existingInterview?.id,
      jobTenantId
    );
    if (conflictCheck.conflict) {
      return {
        success: false,
        error: conflictCheck.error || "Conflict detected: Overlapping interview schedule.",
      };
    }

    // Form proposed_slots JSONB array
    const proposedSlots: TimeSlot[] = normalizedSlots.map((s, index) => ({
      slot_id: `slot_${Date.now()}_${index}`,
      start_time: s.start_time,
      end_time: s.end_time,
      status: "proposed",
    }));

    // Generate video meeting link if not provided
    const roomName = meetingType === "online" || meetingType === "hybrid" ? `kayod-interview-${crypto.randomUUID()}` : null;
    const dynamicMeetingLink = meetingType === "online" || meetingType === "hybrid" ? (meeting_link || `https://meet.jit.si/${roomName}`) : null;

    let invite;
    let isReschedule = false;

    if (existingInterview) {
      isReschedule = true;
      const rescheduleReason = data.notes?.trim() || existingInterview.reschedule_reason || null;

      const { data: updatedInvite, error: updateError } = await supabase
        .from("interview_schedules")
        .update({
          interviewer_id,
          applicant_id: jobApp.applicant_id,
          proposed_slots: proposedSlots,
          selected_slot: null,
          scheduled_at: null,
          duration_minutes: durationMinutes,
          job_id: jobApp.job_id,
          status: "proposed",
          reschedule_reason: rescheduleReason,
          room_name: roomName,
          meeting_link: dynamicMeetingLink,
          video_provider: meetingType === "online" || meetingType === "hybrid" ? "jitsi" : null,
          meeting_type: meetingType,
          office_branch_id: meetingType === "in_person" || meetingType === "hybrid" ? office_branch_id : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInterview.id)
        .select()
        .single();

      if (updateError) {
        console.error("update_interview_schedule", updateError);
        return { success: false, error: updateError.message || "Failed to update interview invitation." };
      }
      invite = updatedInvite;
    } else {
      // Insert into interview_schedules
      const { data: insertedInvite, error: insertError } = await supabase
        .from("interview_schedules")
        .insert({
          application_id,
          interviewer_id,
          applicant_id: jobApp.applicant_id,
          proposed_slots: proposedSlots,
          duration_minutes: durationMinutes,
          job_id: jobApp.job_id,
          status: "proposed",
          room_name: roomName,
          meeting_link: dynamicMeetingLink,
          video_provider: meetingType === "online" || meetingType === "hybrid" ? "jitsi" : null,
          meeting_type: meetingType,
          office_branch_id: meetingType === "in_person" || meetingType === "hybrid" ? office_branch_id : null,
          interview_notes: "",
          scorecard: {},
        })
        .select()
        .single();

      if (insertError) {
        console.error("insert_interview_schedule", insertError);
        return { success: false, error: insertError.message || "Failed to create interview invitation." };
      }
      invite = insertedInvite;
    }

    // Insert notification ONLY AFTER DB write succeeds
    const admin = getAdminClient();
    const { error: notificationError } = await admin.from("notifications").insert({
      recipient_id: jobApp.applicant_id,
      type: isReschedule ? "interview_rescheduled" : "interview_scheduled",
      title: isReschedule ? "Interview Rescheduled" : "Interview Proposed",
      body: `Interview ${isReschedule ? "rescheduled" : "proposed"} for ${new Date(proposedSlots[0].start_time).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}. Meeting type: ${meetingType === "in_person" ? "In-Person" : meetingType === "hybrid" ? "Hybrid" : "Online"}.${branchDetails ? ` Branch: ${branchDetails}.` : ""}`,
      action_url: `/applicant/interviews?interview=${invite.id}`,
      sender_id: user.id,
    });
    if (notificationError) {
      console.error(`createInterviewInvite: failed to insert notification for recipient ${jobApp.applicant_id}:`, notificationError.message);
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
  selectedSlotId: string,
  chosenMode?: "online" | "in_person"
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

    if (schedule.status !== "proposed") {
      return { success: false, error: "Interview slot selection is only available for proposed interviews." };
    }

    if (schedule.meeting_type === "hybrid") {
      if (!chosenMode || !["online", "in_person"].includes(chosenMode)) {
        return { success: false, error: "Please select an interview mode (Online or In-Person)." };
      }
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
    const slotDuration =
      targetSlot.start_time && targetSlot.end_time
        ? Math.max(
            15,
            Math.round(
              (new Date(targetSlot.end_time).getTime() - new Date(targetSlot.start_time).getTime()) /
                60_000
            )
          )
        : (schedule.duration_minutes || DEFAULT_DURATION_MINUTES);

    const finalMeetingType = chosenMode ?? schedule.meeting_type;
    const updatePayload: Record<string, unknown> = {
      proposed_slots: updatedSlots,
      selected_slot: finalSelectedSlot,
      scheduled_at: finalSelectedSlot.start_time,
      duration_minutes: schedule.duration_minutes || slotDuration,
      status: "scheduled",
      meeting_type: finalMeetingType,
      updated_at: new Date().toISOString(),
    };

    if (finalMeetingType === "in_person") {
      updatePayload.meeting_link = null;
      updatePayload.room_name = null;
    }

    const admin = getAdminClient();
    const { error: updateError } = await admin
      .from("interview_schedules")
      .update(updatePayload)
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

export async function cancelInterviewSchedule(interviewId: string): Promise<ActionResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const admin = getAdminClient();
    const { data: interview, error: fetchError } = await admin
      .from("interview_schedules")
      .select("id, applicant_id, status")
      .eq("id", interviewId)
      .single();

    if (fetchError || !interview) {
      return { success: false, error: "Interview schedule not found." };
    }

    const { error: updateError } = await admin
      .from("interview_schedules")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    if (updateError) {
      return { success: false, error: updateError.message || "Failed to cancel interview." };
    }

    if (interview.applicant_id) {
      await admin.from("notifications").insert({
        recipient_id: interview.applicant_id,
        type: "interview_cancelled",
        title: "Interview Cancelled",
        body: "Your interview schedule has been cancelled by HR.",
        action_url: "/applicant/interviews",
        sender_id: user.id,
      });
    }

    revalidatePath("/hr/interviews");
    revalidatePath("/hr/applicants");
    revalidatePath("/applicant/interviews");
    revalidatePath("/applicant/dashboard");

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to cancel interview." };
  }
}

export async function getNextAvailableInterviewSlot(options: {
  applicationId?: string;
  interviewerId?: string;
  applicantId?: string;
  durationMinutes?: number;
  fromDate?: string;
  daysAhead?: number;
  excludeInterviewId?: string;
} = {}): Promise<NextAvailableSlotResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: User not authenticated.");
  }

  // Verify HR role (hr, hr_manager, admin)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const hrRoles = ["hr", "hr_manager", "admin"];
  if (!profile || !hrRoles.includes(profile.role)) {
    throw new Error("Forbidden: HR permissions required.");
  }

  let applicantId = options.applicantId;

  // If applicationId provided, verify it belongs to HR user's tenant
  if (options.applicationId) {
    const { data: jobApp } = await supabase
      .from("job_applications")
      .select("id, applicant_id, job_postings!job_applications_job_id_fkey(tenant_id)")
      .eq("id", options.applicationId)
      .maybeSingle();

    if (!jobApp) {
      throw new Error("Application record not found.");
    }

    const jobTenantId = (jobApp.job_postings as { tenant_id?: string } | null)?.tenant_id;
    if (jobTenantId && profile.tenant_id && jobTenantId !== profile.tenant_id) {
      throw new Error("Forbidden: Application does not belong to your organization.");
    }

    if (!applicantId) {
      applicantId = jobApp.applicant_id;
    }
  }

  const admin = getAdminClient();
  const { getNextAvailableSlot } = await import("@/lib/interview-slots");
  return getNextAvailableSlot({
    ...options,
    applicantId,
    supabaseClient: admin,
  });
}
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InterviewType } from "@/lib/types";
import { normalizeMeetingType, type MeetingType } from "@/lib/meeting-type";
import { getNextDbStatus } from "@/lib/application-stages";
import { sendNotification } from "@/lib/notifications";

export interface OfficeBranchOption {
  id: string;
  name: string;
  address: string | null;
}

export interface InterviewRequirementOption {
  id: string;
  name: string;
  is_required: boolean;
}

export async function getInterviewRequirements(interviewId: string): Promise<{ success: boolean; data?: InterviewRequirementOption[]; error?: string }> {
  const admin = getAdminClient();
  const { data: interview } = await admin
    .from("interview_schedules")
    .select("job_applications!interview_schedules_application_id_fkey(job_id)")
    .eq("id", interviewId)
    .maybeSingle();
  const application = Array.isArray(interview?.job_applications) ? interview?.job_applications[0] : interview?.job_applications;
  if (!application?.job_id) return { success: false, error: "Application not found" };
  const { data, error } = await admin
    .from("job_required_documents")
    .select("id, name, is_required")
    .eq("job_posting_id", application.job_id)
    .order("created_at", { ascending: true });
  return error ? { success: false, error: error.message } : { success: true, data: data ?? [] };
}

export async function getOfficeBranches(): Promise<{ success: boolean; data?: OfficeBranchOption[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return { success: false, error: "Tenant not found" };
  const { data, error } = await supabase
    .from("office_branches")
    .select("id, name, address")
    .eq("tenant_id", profile.tenant_id)
    .order("name");
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

function createWebrtcRoom(applicationId: string) {
  const roomName = `kayod-interview-${applicationId.slice(0, 8)}-${crypto.randomUUID()}`;
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
  const scheduledAt = formData.get("scheduled_at") as string;
  const durationMinutes = Number(formData.get("duration_minutes") as string) || 60;
  const notes = String(formData.get("notes") ?? "").trim();
  const meetingType = normalizeMeetingType(formData.get("meeting_type"));
  const officeBranchId = String(formData.get("office_branch_id") ?? "").trim() || null;

  if (!rawApplicationId || !scheduledAt) return { success: false, error: "Missing required fields" };
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return { success: false, error: "Duration must be positive" };
  if (["in_person", "hybrid"].includes(meetingType) && !officeBranchId) return { success: false, error: "Office branch required for in-person or hybrid interviews." };

  try {
    const { phtInputToUtcIso } = await import("@/lib/interview-date");
    const startIso = phtInputToUtcIso(scheduledAt);
    const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();

    const { createInterviewInvite } = await import("@/app/actions/interviews");
    const result = await createInterviewInvite({
      application_id: rawApplicationId,
      interviewer_id: user.id,
      slots: [{ start_time: startIso, end_time: endIso }],
      duration_minutes: durationMinutes,
      meeting_type: meetingType,
      office_branch_id: ["in_person", "hybrid"].includes(meetingType) ? officeBranchId : null,
      notes,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Failed to schedule interview proposal" };
    }

    revalidatePath("/hr/interviews");
    revalidatePath("/hr/applicants");
    revalidatePath("/hr");

    return { success: true };
  } catch (error) {
    console.error("Error in scheduleInterviewProposal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to schedule interview proposal" };
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
  const scheduledAt     = formData.get("scheduled_at") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string) || 60;
  const meetingType = normalizeMeetingType(formData.get("meeting_type"));
  const officeBranchId = String(formData.get("office_branch_id") ?? "").trim() || null;

  if (!applicationId || !scheduledAt) redirect("/hr/interviews");
  if (["in_person", "hybrid"].includes(meetingType) && !officeBranchId) redirect("/hr/interviews?error=Office%20branch%20required");

  const { phtInputToUtcIso } = await import("@/lib/interview-date");
  const startIso = phtInputToUtcIso(scheduledAt);
  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();

  const { createInterviewInvite } = await import("@/app/actions/interviews");
  const result = await createInterviewInvite({
    application_id: applicationId,
    interviewer_id: user.id,
    slots: [{ start_time: startIso, end_time: endIso }],
    duration_minutes: durationMinutes,
    meeting_type: meetingType,
    office_branch_id: ["in_person", "hybrid"].includes(meetingType) ? officeBranchId : null,
  });

  if (!result.success) {
    redirect(`/hr/interviews?error=${encodeURIComponent(result.error || "Failed to schedule interview")}`);
  }

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
    .from("interview_schedules")
    .update({ status: "cancelled" })
    .eq("id", interviewId);

  revalidatePath("/hr/interviews");
  redirect("/hr/interviews");
}

export type InterviewCompletionOutcome = "advance" | "reject" | "hold";

export async function completeInterview(input: {
  interviewId: string;
  outcome: InterviewCompletionOutcome;
  notes?: string;
  rejectionReason?: string;
  meetingType?: MeetingType;
  officeBranchId?: string | null;
  sendRequirements?: boolean;
  requirementIds?: string[];
  deadline?: string | null;
  note?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Unauthorized" };
  if (!await verifyHR(supabase, user.id)) return { success: false, error: "Unauthorized" };
  if (!input.interviewId || !["advance", "reject", "hold"].includes(input.outcome)) {
    return { success: false, error: "Invalid completion input" };
  }
  if (input.outcome === "reject" && !input.rejectionReason?.trim()) {
    return { success: false, error: "Rejection reason is required" };
  }

  const admin = getAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  const { data: interview, error: interviewError } = await admin
    .from("interview_schedules")
    .select("id, application_id, status, meeting_type, office_branch_id, interview_notes, updated_at, job_applications!interview_schedules_application_id_fkey(id, job_id, applicant_id, status, rejection_reason, job_postings!job_applications_job_id_fkey(tenant_id, title))")
    .eq("id", input.interviewId)
    .single();

  if (interviewError || !interview) {
    return { success: false, error: "Interview not found" };
  }

  const application = Array.isArray(interview.job_applications)
    ? interview.job_applications[0]
    : interview.job_applications;
  const tenantId = (application?.job_postings as { tenant_id?: string | null } | null)?.tenant_id;

  if (!interview.application_id || !application || !profile?.tenant_id || !tenantId || profile.tenant_id !== tenantId) {
    return { success: false, error: "Unauthorized" };
  }

  const meetingType = normalizeMeetingType(input.meetingType ?? interview.meeting_type);
  const officeBranchId = input.officeBranchId ?? interview.office_branch_id ?? null;
  if (["in_person", "hybrid"].includes(meetingType)) {
    if (!officeBranchId) return { success: false, error: "Office branch required for in-person interview" };
    const { data: branch } = await admin
      .from("office_branches")
      .select("id")
      .eq("id", officeBranchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!branch) return { success: false, error: "Office branch is not in the interview tenant" };
  }

  if (interview.status === "completed") {
    return { success: true };
  }

  const completedAt = new Date().toISOString();
  const interviewUpdate = {
    status: "completed",
    updated_at: completedAt,
    interview_notes: input.notes?.trim() || interview.interview_notes || "",
    meeting_type: meetingType,
    office_branch_id: ["in_person", "hybrid"].includes(meetingType) ? officeBranchId : null,
  };

  const { data: completedInterview, error: updateInterviewError } = await admin
    .from("interview_schedules")
    .update(interviewUpdate)
    .eq("id", input.interviewId)
    .neq("status", "completed")
    .select("id")
    .maybeSingle();

  if (updateInterviewError) {
    return { success: false, error: updateInterviewError.message };
  }
  if (!completedInterview) {
    return { success: true };
  }

  let requirementsWarning: string | undefined;
  if (input.sendRequirements) {
    const legacy = await admin
      .from("applications")
      .select("id")
      .eq("job_posting_id", application.job_id)
      .eq("candidate_id", application.applicant_id)
      .maybeSingle();
    if (!legacy.data) {
      requirementsWarning = "Interview completed, but no legacy application record was found for document requests.";
    } else {
      const requirementIds = Array.from(new Set(input.requirementIds ?? []));
      const { data: requirements } = await admin
        .from("job_required_documents")
        .select("id")
        .eq("job_posting_id", application.job_id)
        .in("id", requirementIds);
      if (!requirements || requirements.length !== requirementIds.length) {
        requirementsWarning = "Interview completed, but one or more document requirements were invalid.";
      } else {
        const legacyApplicationId = legacy.data.id;
        const { error: legacyError } = await admin
          .from("applications")
          .update({
            status: "pre_employment",
            doc_deadline: input.deadline || null,
            doc_submission_note: input.note?.trim() || null,
          })
          .eq("id", legacyApplicationId);
        if (!legacyError) {
          const { error: requestError } = await admin
            .from("applicant_documents")
            .upsert(requirementIds.map((documentId) => ({
              application_id: legacyApplicationId,
              applicant_id: application.applicant_id,
              document_id: documentId,
              file_url: null,
              submitted_at: null,
              hr_verified: false,
            })), { onConflict: "application_id,document_id", ignoreDuplicates: true });
          if (requestError) requirementsWarning = `Interview completed, but document requests failed: ${requestError.message}`;
          else await sendNotification({
            supabase: admin,
            recipientId: application.applicant_id,
            type: "document_request",
            title: "Pre-hire documents requested",
            body: "Please submit your requested pre-hire documents.",
            actionUrl: `/apply/applications/${legacy.data.id}/documents`,
            senderId: user.id,
          });
        } else {
          requirementsWarning = `Interview completed, but document requests failed: ${legacyError.message}`;
        }
      }
    }
  }

  const nextStatus = input.outcome === "advance"
    ? getNextDbStatus("interview")
    : input.outcome === "reject"
      ? "rejected"
      : application.status;
  const applicationUpdate: Record<string, string | null> = {};
  if (input.outcome !== "hold" && nextStatus) {
    applicationUpdate.status = nextStatus;
  }
  if (input.outcome === "reject") {
    applicationUpdate.rejection_reason = input.rejectionReason!.trim();
  }

  if (Object.keys(applicationUpdate).length > 0) {
    const { error: updateApplicationError } = await admin
      .from("job_applications")
      .update(applicationUpdate)
      .eq("id", application.id)
      .eq("status", application.status);

    if (updateApplicationError) {
      await admin
        .from("interview_schedules")
        .update({
          status: interview.status,
          updated_at: interview.updated_at,
          interview_notes: interview.interview_notes,
        })
        .eq("id", input.interviewId);
      return { success: false, error: updateApplicationError.message };
    }
  }

  await sendNotification({
    supabase: admin,
    recipientId: application.applicant_id,
    type: "application_status_changed",
    title: input.outcome === "reject" ? "Application Update" : "Interview Completed",
    body: input.outcome === "advance"
      ? `Your interview for ${(application.job_postings as { title?: string } | null)?.title ?? "the position"} is complete. Your application advanced to Offer & Contract.`
      : input.outcome === "reject"
        ? `Your application for ${(application.job_postings as { title?: string } | null)?.title ?? "the position"} was not advanced after the interview.`
        : "Your interview is complete and remains in the Interview stage.",
    actionUrl: "/applicant/applications",
    senderId: user.id,
  });

  revalidatePath("/hr/interviews");
  revalidatePath("/hr/applicants");
  revalidatePath("/applicant/applications");

  return { success: true, warning: requirementsWarning };
}

/** @deprecated Use completeInterview with an explicit outcome. */
export async function confirmInterviewDone(interviewId: string) {
  return completeInterview({ interviewId, outcome: "hold" });
}

export async function updateInterviewPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const interviewId = formData.get("interview_id") as string;
  const interviewType = normalizeMeetingType(formData.get("interview_type"));

  if (!interviewId || !interviewType) redirect("/hr/interviews");

  const { data: interview } = await supabase
    .from("interview_schedules")
    .select("id, applicant_id, meeting_type, office_branch_id")
    .eq("id", interviewId)
    .single();

  if (!interview) redirect("/hr/interviews");

  if (interview.applicant_id !== user.id) redirect("/hr/interviews");

  let videoRoomUrl = null;
  let videoRoomName = null;

  if (interviewType === "online" || interviewType === "hybrid") {
    videoRoomName = `kayod-${interviewId.slice(0, 8)}-${Date.now()}`;
    videoRoomUrl = `https://meet.jit.si/${videoRoomName}`;
  }

  const { error } = await supabase
    .from("interview_schedules")
    .update({
      meeting_link: videoRoomUrl,
      room_name: videoRoomName,
      video_provider: interviewType === "online" || interviewType === "hybrid" ? "jitsi" : null,
      meeting_type: interview.meeting_type,
      office_branch_id: interview.office_branch_id,
    })
    .eq("id", interviewId);

  if (error) redirect(`/hr/interviews?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/hr/interviews");
  redirect("/hr/interviews");
}
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { sendNotification } from "@/lib/notifications";

export type ReviewAttendanceCorrectionPayload = {
  requestId: string;
  decision: "approved" | "rejected";
  reviewNotes?: string;
};

export type ReviewAttendanceCorrectionResult =
  | { success: true; message: string }
  | { success: false; error: string };

function computeLatenessForShift(clockInIso: string, shiftStartRaw: string | null) {
  const clockInDate = new Date(clockInIso);
  const [hStr, mStr] = (shiftStartRaw ?? "08:00").split(":");
  const targetH = parseInt(hStr, 10);
  const targetM = parseInt(mStr, 10);

  // Convert clock-in to Asia/Manila wall-clock hours/minutes for accurate shift comparison
  const phtParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(clockInDate);

  const actualH = parseInt(phtParts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const actualM = parseInt(phtParts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const schedH = Number.isNaN(targetH) ? 8 : targetH;
  const schedM = Number.isNaN(targetM) ? 0 : targetM;

  const diffMins = actualH * 60 + actualM - (schedH * 60 + schedM);
  if (diffMins > 5) {
    return { isLate: true, lateMinutes: diffMins };
  }
  return { isLate: false, lateMinutes: 0 };
}

export async function reviewAttendanceCorrectionAction(
  payload: ReviewAttendanceCorrectionPayload
): Promise<ReviewAttendanceCorrectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const admin = getAdminClient();
  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; tenant_id: string | null }>();

  const role = effectiveRole(actorProfile?.role, authRole);
  if (!isHRRole(role)) {
    return { success: false, error: "HR authorization required." };
  }

  const { data: reqRow, error: reqErr } = await admin
    .from("attendance_correction_requests")
    .select("*")
    .eq("id", payload.requestId)
    .maybeSingle();

  if (reqErr || !reqRow) {
    return { success: false, error: "Correction request not found." };
  }

  if (reqRow.status !== "pending") {
    return { success: false, error: `Request has already been ${reqRow.status}.` };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("id, profile_id, tenant_id, shift_start, work_mode")
    .eq("id", reqRow.employee_id)
    .maybeSingle<{
      id: string;
      profile_id: string | null;
      tenant_id: string | null;
      shift_start: string | null;
      work_mode: string | null;
    }>();

  if (!emp) {
    return { success: false, error: "Employee record not found." };
  }

  const nowIso = new Date().toISOString();
  const cleanNotes = payload.reviewNotes?.trim() || null;

  if (payload.decision === "approved") {
    // Resolve employee's published schedule shift_start if available
    const { data: latestSchedule } = await admin
      .from("schedules")
      .select("shift_start")
      .eq("employee_id", emp.id)
      .eq("is_published", true)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle<{ shift_start: string | null }>();

    const effectiveShiftStart = latestSchedule?.shift_start || emp.shift_start || "08:00";
    const { isLate, lateMinutes } = computeLatenessForShift(
      reqRow.requested_clock_in,
      effectiveShiftStart
    );

    const totalHours = reqRow.requested_clock_out
      ? Number(
          Math.max(
            0,
            (new Date(reqRow.requested_clock_out).getTime() -
              new Date(reqRow.requested_clock_in).getTime()) /
              3_600_000
          ).toFixed(2)
        )
      : null;

    const isRemote = emp.work_mode === "remote" || emp.work_mode === "wfh";
    const zoneStatus = isRemote ? "remote_verified" : "onsite_verified";
    const logStatus = reqRow.requested_clock_out ? "completed" : zoneStatus;

    if (reqRow.attendance_log_id) {
      const { error: updateLogErr } = await admin
        .from("attendance_logs")
        .update({
          clock_in: reqRow.requested_clock_in,
          clock_out: reqRow.requested_clock_out,
          total_hours: totalHours,
          status: logStatus,
          is_late: isLate,
          late_minutes: lateMinutes,
          break_status: reqRow.requested_clock_out ? "clocked_out" : "active",
          updated_at: nowIso,
        })
        .eq("id", reqRow.attendance_log_id)
        .eq("employee_id", emp.id);

      if (updateLogErr) {
        return { success: false, error: updateLogErr.message };
      }
    } else {
      const { error: insertLogErr } = await admin.from("attendance_logs").insert({
        employee_id: emp.id,
        tenant_id: reqRow.tenant_id ?? emp.tenant_id,
        date: reqRow.target_date,
        clock_in: reqRow.requested_clock_in,
        clock_out: reqRow.requested_clock_out,
        total_hours: totalHours,
        status: logStatus,
        is_late: isLate,
        late_minutes: lateMinutes,
        zone_status: zoneStatus,
        location_used: isRemote ? "remote_residence" : "office_branch",
        verification_type: isRemote ? "remote_residence" : "office_branch",
        break_status: reqRow.requested_clock_out ? "clocked_out" : "active",
      });

      if (insertLogErr) {
        return { success: false, error: insertLogErr.message };
      }
    }

    const { error: updateReqErr } = await admin
      .from("attendance_correction_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: nowIso,
        review_notes: cleanNotes,
      })
      .eq("id", reqRow.id);

    if (updateReqErr) {
      return { success: false, error: updateReqErr.message };
    }

    if (emp.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: emp.profile_id,
        sender_id: user.id,
        type: "general",
        title: "Attendance Correction Approved",
        body: `Your ${reqRow.correction_type} request for ${reqRow.target_date} was approved and applied.${cleanNotes ? ` Note: ${cleanNotes}` : ""}`,
        action_url: "/employee/schedule",
      });
    }

    revalidatePath("/hr/attendance");
    revalidatePath("/employee/schedule");
    revalidatePath("/hr/payroll");
    return {
      success: true,
      message: "Correction approved and attendance log updated.",
    };
  }

  // Reject
  const { error: rejectErr } = await admin
    .from("attendance_correction_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: nowIso,
      review_notes: cleanNotes,
    })
    .eq("id", reqRow.id);

  if (rejectErr) {
    return { success: false, error: rejectErr.message };
  }

  if (emp.profile_id) {
    await admin.from("notifications").insert({
      recipient_id: emp.profile_id,
      sender_id: user.id,
      type: "general",
      title: "Attendance Correction Rejected",
      body: `Your ${reqRow.correction_type} request for ${reqRow.target_date} was rejected.${cleanNotes ? ` Reason: ${cleanNotes}` : ""}`,
      action_url: "/employee/schedule",
    });
  }

  revalidatePath("/hr/attendance");
  revalidatePath("/employee/schedule");
  return {
    success: true,
    message: "Correction request rejected.",
  };
}

export type ReviewOvertimeRequestPayload = {
  requestId: string;
  decision: "approved" | "rejected";
  reviewNote?: string;
};

export type CreatePreApprovedOvertimePayload = {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export async function reviewOvertimeRequestAction(
  payload: ReviewOvertimeRequestPayload
): Promise<ReviewAttendanceCorrectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const admin = getAdminClient();
  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const role = effectiveRole(actorProfile?.role, authRole);
  if (!isHRRole(role)) {
    return { success: false, error: "HR authorization required." };
  }

  const { data: otRow } = await admin
    .from("overtime_requests")
    .select("id, employee_id, supervisor_id, work_date, start_time, end_time, status")
    .eq("id", payload.requestId)
    .maybeSingle<{
      id: string;
      employee_id: string;
      supervisor_id?: string | null;
      work_date: string;
      start_time: string;
      end_time: string;
      status: string;
    }>();

  if (!otRow) {
    return { success: false, error: "Overtime request not found." };
  }
  if (!["pending", "pending_hr", "pending_supervisor"].includes(otRow.status)) {
    return { success: false, error: `Overtime request is already ${otRow.status}.` };
  }

  const cleanNote = payload.reviewNote?.trim() || null;
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("overtime_requests")
    .update({
      status: payload.decision,
      hr_reviewer_id: user.id,
      hr_action_at: nowIso,
      hr_remarks: cleanNote,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      review_note: cleanNote,
    })
    .eq("id", otRow.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("profile_id, reports_to, profile:profiles!profile_id(first_name, last_name)")
    .eq("id", otRow.employee_id)
    .maybeSingle<{
      profile_id: string | null;
      reports_to: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (emp?.profile_id) {
    await sendNotification({
      recipientId: emp.profile_id,
      senderId: user.id,
      type: "general",
      title:
        payload.decision === "approved"
          ? "Overtime Request Approved"
          : "Overtime Request Rejected",
      body:
        payload.decision === "approved"
          ? `Your overtime request for ${otRow.work_date} (${otRow.start_time.slice(0, 5)}–${otRow.end_time.slice(0, 5)}) was approved by HR.`
          : `Your overtime request for ${otRow.work_date} was declined by HR.${cleanNote ? ` Note: ${cleanNote}` : ""}`,
      actionUrl: "/employee/schedule",
      actionName: "reviewOvertimeRequestAction",
    });
  }

  const supervisorEmpId = otRow.supervisor_id ?? emp?.reports_to ?? null;
  if (supervisorEmpId) {
    const { data: supEmp } = await admin
      .from("employees")
      .select("profile_id")
      .eq("id", supervisorEmpId)
      .maybeSingle<{ profile_id: string | null }>();

    if (supEmp?.profile_id && supEmp.profile_id !== emp?.profile_id) {
      const empProf = Array.isArray(emp?.profile) ? emp?.profile[0] : emp?.profile;
      const empName =
        [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
        "Your direct report";
      await sendNotification({
        recipientId: supEmp.profile_id,
        senderId: user.id,
        type: "general",
        title:
          payload.decision === "approved"
            ? "Team Overtime Approved by HR"
            : "Team Overtime Rejected by HR",
        body:
          payload.decision === "approved"
            ? `${empName}'s overtime for ${otRow.work_date} (${otRow.start_time.slice(0, 5)}–${otRow.end_time.slice(0, 5)}) was approved by HR.`
            : `${empName}'s overtime for ${otRow.work_date} was declined by HR.${cleanNote ? ` Note: ${cleanNote}` : ""}`,
        actionUrl: "/employee/team",
        actionName: "reviewOvertimeRequestAction",
      });
    }
  }

  revalidatePath("/hr/attendance");
  revalidatePath("/employee/schedule");
  return {
    success: true,
    message:
      payload.decision === "approved"
        ? "Overtime request approved."
        : "Overtime request rejected.",
  };
}

export async function createPreApprovedOvertimeAction(
  payload: CreatePreApprovedOvertimePayload
): Promise<ReviewAttendanceCorrectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const admin = getAdminClient();
  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const role = effectiveRole(actorProfile?.role, authRole);
  if (!isHRRole(role)) {
    return { success: false, error: "HR authorization required." };
  }

  const workDate = payload.workDate?.trim();
  const startTime = payload.startTime?.trim();
  const endTime = payload.endTime?.trim();
  const reason = payload.reason?.trim();

  if (!payload.employeeId) {
    return { success: false, error: "Please select an employee." };
  }
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { success: false, error: "Please select a valid work date." };
  }
  if (!startTime || !endTime || endTime <= startTime) {
    return { success: false, error: "End time must be after start time." };
  }
  if (!reason || reason.length < 5) {
    return { success: false, error: "Please provide a reason (at least 5 characters)." };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("id, tenant_id, profile_id")
    .eq("id", payload.employeeId)
    .maybeSingle<{ id: string; tenant_id: string | null; profile_id: string | null }>();

  if (!emp) {
    return { success: false, error: "Employee not found." };
  }

  const nowIso = new Date().toISOString();
  const { error: insertErr } = await admin.from("overtime_requests").insert({
    tenant_id: emp.tenant_id,
    employee_id: emp.id,
    work_date: workDate,
    start_time: startTime,
    end_time: endTime,
    reason,
    status: "approved",
    requested_by: user.id,
    reviewed_by: user.id,
    reviewed_at: nowIso,
    review_note: "Pre-approved by HR for urgent coverage",
  });

  if (insertErr) {
    return { success: false, error: insertErr.message };
  }

  if (emp.profile_id) {
    await admin.from("notifications").insert({
      recipient_id: emp.profile_id,
      sender_id: user.id,
      type: "general",
      title: "Urgent Overtime Approved",
      body: `HR pre-approved overtime for ${workDate} (${startTime}–${endTime}). You can clock in from your schedule.`,
      action_url: "/employee/schedule",
    });
  }

  revalidatePath("/hr/attendance");
  revalidatePath("/employee/schedule");
  return {
    success: true,
    message: "Pre-approved overtime pass issued.",
  };
}

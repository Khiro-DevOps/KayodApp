"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";

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

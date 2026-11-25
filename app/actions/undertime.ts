"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";
import {
  computeLeaveOffsetDays,
  computeUndertimeWindow,
  formatUndertimeTypeLabel,
  normalizeTimeHm,
  type UndertimeDeductionMode,
  type UndertimeRequestSummary,
  type UndertimeType,
} from "@/lib/undertime";

export interface SubmitUndertimePayload {
  workDate: string;
  undertimeType?: UndertimeType;
  requestedOut?: string;
  requestedIn?: string;
  reason: string;
  coverageNotes?: string;
  deductionMode?: UndertimeDeductionMode;
}

export interface UndertimeActionResult {
  success: boolean;
  message?: string;
  error?: string;
  request?: UndertimeRequestSummary;
}

const UNDERTIME_REVALIDATE_PATHS = [
  "/employee/schedule",
  "/employee/leaves",
  "/employee/team",
  "/team/approvals",
  "/hr/attendance",
  "/hr/approvals",
];

function revalidateUndertimeRoutes() {
  for (const path of UNDERTIME_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

async function resolveCurrentEmployee(userId: string) {
  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, tenant_id, reports_to, shift_start, shift_end, employment_status")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      reports_to: string | null;
      shift_start: string | null;
      shift_end: string | null;
      employment_status: string | null;
    }>();

  if (!employee) return null;

  let tenantId = employee.tenant_id ?? null;
  if (!tenantId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle<{ tenant_id: string | null }>();
    tenantId = profile?.tenant_id ?? null;
  }

  return { ...employee, tenant_id: tenantId };
}

async function getEmployeeAvailableVlCredits(
  admin: ReturnType<typeof getAdminClient>,
  employeeId: string,
  year: number,
  excludeRequestId?: string
): Promise<{
  available: number;
  ledgerRowId: string | null;
  usedDays: number;
  legacyRowId: string | null;
  legacyRemaining: number | null;
}> {
  const { data: ledgerRow } = await admin
    .from("employee_leave_balances")
    .select("id, entitled_days, used_days, pending_days")
    .eq("employee_id", employeeId)
    .eq("year", year)
    .eq("leave_type", "VL")
    .eq("is_active", true)
    .maybeSingle<{
      id: string;
      entitled_days: number;
      used_days: number;
      pending_days: number;
    }>();

  let rawAvailable = 0;
  let ledgerRowId: string | null = null;
  let usedDays = 0;
  let legacyRowId: string | null = null;
  let legacyRemaining: number | null = null;

  if (ledgerRow) {
    ledgerRowId = ledgerRow.id;
    usedDays = Number(ledgerRow.used_days ?? 0);
    rawAvailable =
      Number(ledgerRow.entitled_days ?? 0) -
      usedDays -
      Number(ledgerRow.pending_days ?? 0);
  } else {
    const { data: legacyRow } = await admin
      .from("leave_balances")
      .select("id, remaining_days")
      .eq("employee_id", employeeId)
      .eq("year", year)
      .eq("leave_type", "vacation")
      .maybeSingle<{ id: string; remaining_days: number }>();
    if (legacyRow) {
      legacyRowId = legacyRow.id;
      legacyRemaining = Number(legacyRow.remaining_days ?? 0);
      rawAvailable = legacyRemaining;
    }
  }

  let pendingUtQuery = admin
    .from("undertime_requests")
    .select("id, undertime_minutes")
    .eq("employee_id", employeeId)
    .eq("deduction_mode", "leave_offset")
    .in("status", ["pending_supervisor", "pending_hr"])
    .gte("work_date", `${year}-01-01`)
    .lte("work_date", `${year}-12-31`);

  if (excludeRequestId) {
    pendingUtQuery = pendingUtQuery.neq("id", excludeRequestId);
  }

  const { data: pendingOffsets } = await pendingUtQuery;
  const reservedOffsetDays = (pendingOffsets ?? []).reduce(
    (sum, row) =>
      sum + computeLeaveOffsetDays(Number((row as { undertime_minutes?: number }).undertime_minutes ?? 0)),
    0
  );

  return {
    available: Math.max(0, Number((rawAvailable - reservedOffsetDays).toFixed(4))),
    ledgerRowId,
    usedDays,
    legacyRowId,
    legacyRemaining,
  };
}

export async function submitUndertimeRequestAction(
  payload: SubmitUndertimePayload
): Promise<UndertimeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found." };
  }
  if (!employee.tenant_id) {
    return { success: false, error: "Tenant ID is missing on your employee profile." };
  }

  const workDate = payload.workDate?.trim();
  const undertimeType: UndertimeType = payload.undertimeType ?? "early_out";
  const reason = payload.reason?.trim() ?? "";
  const coverageNotes = payload.coverageNotes?.trim() || null;
  const deductionMode: UndertimeDeductionMode =
    payload.deductionMode === "leave_offset" ? "leave_offset" : "payroll_deduction";

  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { success: false, error: "Please select a valid work date." };
  }
  if (
    !["early_out", "late_in", "half_day_first", "half_day_second"].includes(
      undertimeType
    )
  ) {
    return { success: false, error: "Invalid undertime request type." };
  }
  if (reason.length < 5) {
    return { success: false, error: "Please provide a reason (at least 5 characters)." };
  }

  const admin = getAdminClient();

  const { data: publishedSchedule } = await admin
    .from("schedules")
    .select("shift_start, shift_end")
    .eq("employee_id", employee.id)
    .eq("is_published", true)
    .lte("week_start", workDate)
    .order("week_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ shift_start: string | null; shift_end: string | null }>();

  const lockedShiftStart = normalizeTimeHm(
    publishedSchedule?.shift_start ?? employee.shift_start ?? "08:00"
  );
  const lockedScheduledOut = normalizeTimeHm(
    publishedSchedule?.shift_end ?? employee.shift_end ?? "17:00"
  );

  const calc = computeUndertimeWindow({
    scheduledIn: lockedShiftStart,
    scheduledOut: lockedScheduledOut,
    undertimeType,
    requestedOut: payload.requestedOut ? normalizeTimeHm(payload.requestedOut) : null,
    requestedIn: payload.requestedIn ? normalizeTimeHm(payload.requestedIn) : null,
  });

  if (!calc.valid) {
    return { success: false, error: calc.error ?? "Invalid undertime window." };
  }

  // Option A: Validate available VL balance if leave_offset is selected
  if (deductionMode === "leave_offset") {
    const year = Number.parseInt(workDate.slice(0, 4), 10) || new Date().getFullYear();
    const requiredCredits = computeLeaveOffsetDays(calc.undertimeMinutes);
    const { available } = await getEmployeeAvailableVlCredits(admin, employee.id, year);
    if (available + 1e-6 < requiredCredits) {
      return {
        success: false,
        error: `Insufficient Vacation Leave balance (need ${requiredCredits.toFixed(
          2
        )} days, have ${available.toFixed(2)} days).`,
      };
    }
  }

  // Prevent duplicate active request on the same work_date
  const { data: existing } = await admin
    .from("undertime_requests")
    .select("id, status")
    .eq("tenant_id", employee.tenant_id)
    .eq("employee_id", employee.id)
    .eq("work_date", workDate)
    .in("status", ["pending_supervisor", "pending_hr", "approved"])
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();

  if (existing) {
    return {
      success: false,
      error: `You already have an active undertime request (${existing.status.replace(
        "_",
        " "
      )}) for ${workDate}.`,
    };
  }

  const hasSupervisor = Boolean(employee.reports_to);
  const initialStatus = hasSupervisor ? "pending_supervisor" : "pending_hr";

  const { data: inserted, error: insertErr } = await admin
    .from("undertime_requests")
    .insert({
      tenant_id: employee.tenant_id,
      employee_id: employee.id,
      approver_id: employee.reports_to ?? null,
      work_date: workDate,
      undertime_type: undertimeType,
      scheduled_in: calc.scheduledIn,
      scheduled_out: calc.scheduledOut,
      requested_in: calc.effectiveIn,
      requested_out: calc.effectiveOut,
      undertime_minutes: calc.undertimeMinutes,
      leave_credits_deducted: 0,
      reason,
      coverage_notes: coverageNotes,
      deduction_mode: deductionMode,
      status: initialStatus,
    })
    .select(
      "id, work_date, undertime_type, scheduled_in, scheduled_out, requested_in, requested_out, undertime_minutes, leave_credits_deducted, reason, coverage_notes, deduction_mode, status, supervisor_acted_at, hr_acted_at, rejection_reason, created_at"
    )
    .single<UndertimeRequestSummary>();

  if (insertErr || !inserted) {
    return {
      success: false,
      error: insertErr?.message || "Failed to submit undertime request.",
    };
  }

  // Best-effort notifications
  try {
    const { data: empProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle<{ first_name: string | null; last_name: string | null }>();
    const employeeName =
      [empProfile?.first_name, empProfile?.last_name].filter(Boolean).join(" ").trim() ||
      "An employee";
    const typeLabel = formatUndertimeTypeLabel(undertimeType);

    if (hasSupervisor && employee.reports_to) {
      const { data: supRow } = await admin
        .from("employees")
        .select("profile_id")
        .eq("id", employee.reports_to)
        .maybeSingle<{ profile_id: string | null }>();

      if (supRow?.profile_id && supRow.profile_id !== user.id) {
        await admin.from("notifications").insert({
          recipient_id: supRow.profile_id,
          sender_id: user.id,
          type: "general",
          title: `${typeLabel} Request Pending Review`,
          body: `${employeeName} requested ${typeLabel} on ${workDate} (${calc.undertimeMinutes}m, window ${calc.effectiveIn}–${calc.effectiveOut}).`,
          action_url: "/employee/team",
        });
      }
    } else {
      const { data: hrProfiles } = await admin
        .from("profiles")
        .select("id")
        .eq("tenant_id", employee.tenant_id)
        .in("role", ["hr_manager", "hr", "admin"]);

      if (hrProfiles && hrProfiles.length > 0) {
        await admin.from("notifications").insert(
          hrProfiles.map((hr) => ({
            recipient_id: hr.id,
            sender_id: user.id,
            type: "general",
            title: `${typeLabel} Request Pending HR Verification`,
            body: `${employeeName} requested ${typeLabel} on ${workDate} (${calc.undertimeMinutes}m, window ${calc.effectiveIn}–${calc.effectiveOut}).`,
            action_url: "/hr/attendance",
          }))
        );
      }
    }
  } catch (notifErr) {
    console.error("submitUndertimeRequestAction notification warning:", notifErr);
  }

  revalidateUndertimeRoutes();
  return {
    success: true,
    message: hasSupervisor
      ? "Undertime request submitted to your immediate supervisor."
      : "Undertime request submitted for HR verification.",
    request: inserted,
  };
}

export async function cancelUndertimeRequestAction(
  requestId: string
): Promise<UndertimeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found." };
  }

  const admin = getAdminClient();
  const { data: row } = await admin
    .from("undertime_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("employee_id", employee.id)
    .maybeSingle<{ id: string; status: string }>();

  if (!row) {
    return { success: false, error: "Undertime request not found." };
  }
  if (row.status !== "pending_supervisor") {
    return {
      success: false,
      error: "Only requests awaiting supervisor review can be cancelled.",
    };
  }

  const { error: updateErr } = await admin
    .from("undertime_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("employee_id", employee.id)
    .eq("status", "pending_supervisor");

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidateUndertimeRoutes();
  return { success: true, message: "Undertime request cancelled." };
}

export async function supervisorReviewUndertimeAction(payload: {
  requestId: string;
  decision: "approve" | "reject";
  rejectionReason?: string;
}): Promise<UndertimeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const supervisor = await resolveCurrentEmployee(user.id);
  if (!supervisor) {
    return { success: false, error: "Active supervisor profile not found." };
  }

  const cleanRejection = payload.rejectionReason?.trim() ?? "";
  if (payload.decision === "reject" && cleanRejection.length < 3) {
    return {
      success: false,
      error: "Please enter a rejection reason (at least 3 characters).",
    };
  }

  const admin = getAdminClient();
  const { data: reqRow } = await admin
    .from("undertime_requests")
    .select(
      "id, tenant_id, employee_id, approver_id, work_date, undertime_type, undertime_minutes, status"
    )
    .eq("id", payload.requestId)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      employee_id: string;
      approver_id: string | null;
      work_date: string;
      undertime_type: UndertimeType;
      undertime_minutes: number;
      status: string;
    }>();

  if (!reqRow) {
    return { success: false, error: "Undertime request not found." };
  }

  const { data: targetEmp } = await admin
    .from("employees")
    .select("id, profile_id, reports_to")
    .eq("id", reqRow.employee_id)
    .maybeSingle<{ id: string; profile_id: string | null; reports_to: string | null }>();

  const isAuthorizedSupervisor =
    reqRow.approver_id === supervisor.id || targetEmp?.reports_to === supervisor.id;
  if (!isAuthorizedSupervisor) {
    return {
      success: false,
      error: "Forbidden: you can only review undertime requests for your direct reports.",
    };
  }

  if (reqRow.status !== "pending_supervisor") {
    return {
      success: false,
      error: "This undertime request is no longer awaiting supervisor review.",
    };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = payload.decision === "approve" ? "pending_hr" : "rejected";

  const { error: updateErr } = await admin
    .from("undertime_requests")
    .update({
      status: nextStatus,
      supervisor_acted_at: nowIso,
      rejection_reason: payload.decision === "reject" ? cleanRejection : null,
      updated_at: nowIso,
    })
    .eq("id", reqRow.id)
    .eq("status", "pending_supervisor");

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  try {
    const typeLabel = formatUndertimeTypeLabel(reqRow.undertime_type);
    if (targetEmp?.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: targetEmp.profile_id,
        sender_id: user.id,
        type: "general",
        title:
          payload.decision === "approve"
            ? `${typeLabel} Approved by Supervisor`
            : `${typeLabel} Request Rejected`,
        body:
          payload.decision === "approve"
            ? `Your ${typeLabel} request for ${reqRow.work_date} (${reqRow.undertime_minutes}m) was approved by your supervisor and forwarded to HR.`
            : `Your ${typeLabel} request for ${reqRow.work_date} was declined by your supervisor. Reason: ${cleanRejection}`,
        action_url: "/employee/schedule",
      });
    }

    if (payload.decision === "approve") {
      const { data: hrProfiles } = await admin
        .from("profiles")
        .select("id")
        .eq("tenant_id", reqRow.tenant_id)
        .in("role", ["hr_manager", "hr", "admin"]);

      if (hrProfiles && hrProfiles.length > 0) {
        await admin.from("notifications").insert(
          hrProfiles.map((hr) => ({
            recipient_id: hr.id,
            sender_id: user.id,
            type: "general",
            title: `${typeLabel} Ready for HR Verification`,
            body: `Supervisor approved ${reqRow.undertime_minutes}m (${typeLabel}) on ${reqRow.work_date}. Ready for HR verification.`,
            action_url: "/hr/attendance",
          }))
        );
      }
    }
  } catch (notifErr) {
    console.error("supervisorReviewUndertimeAction notification warning:", notifErr);
  }

  revalidateUndertimeRoutes();
  return {
    success: true,
    message:
      payload.decision === "approve"
        ? "Undertime approved and forwarded to HR."
        : "Undertime request rejected.",
  };
}

export async function hrReviewUndertimeAction(payload: {
  requestId: string;
  decision: "approve" | "reject";
  rejectionReason?: string;
}): Promise<UndertimeActionResult> {
  const ctx = await getHrSessionContext();
  if (
    !ctx ||
    (!canHr(ctx.hr_role, "attendance:manage", ctx.is_tenant_owner) &&
      !canHr(ctx.hr_role, "leaves:final_approve", ctx.is_tenant_owner))
  ) {
    return { success: false, error: "HR authorization required." };
  }

  const cleanRejection = payload.rejectionReason?.trim() ?? "";
  if (payload.decision === "reject" && cleanRejection.length < 3) {
    return {
      success: false,
      error: "Please enter a rejection reason (at least 3 characters).",
    };
  }

  const admin = getAdminClient();
  const { data: reqRow } = await admin
    .from("undertime_requests")
    .select(
      "id, tenant_id, employee_id, approver_id, work_date, undertime_type, requested_in, requested_out, undertime_minutes, deduction_mode, status"
    )
    .eq("id", payload.requestId)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      employee_id: string;
      approver_id: string | null;
      work_date: string;
      undertime_type: UndertimeType;
      requested_in: string | null;
      requested_out: string | null;
      undertime_minutes: number;
      deduction_mode: UndertimeDeductionMode;
      status: string;
    }>();

  if (!reqRow) {
    return { success: false, error: "Undertime request not found." };
  }

  if (ctx.tenant_id && reqRow.tenant_id && ctx.tenant_id !== reqRow.tenant_id) {
    return { success: false, error: "Forbidden: cross-tenant undertime review." };
  }

  if (reqRow.status !== "pending_hr") {
    return {
      success: false,
      error: "This undertime request is not awaiting HR verification.",
    };
  }

  let creditsDeducted = 0;

  // Option A: Re-verify and atomically deduct VL balance on HR approval
  if (payload.decision === "approve" && reqRow.deduction_mode === "leave_offset") {
    const year = Number.parseInt(reqRow.work_date.slice(0, 4), 10) || new Date().getFullYear();
    const requiredCredits = computeLeaveOffsetDays(reqRow.undertime_minutes);
    const bal = await getEmployeeAvailableVlCredits(
      admin,
      reqRow.employee_id,
      year,
      reqRow.id
    );

    if (bal.available + 1e-6 < requiredCredits) {
      return {
        success: false,
        error: `Insufficient Vacation Leave balance to approve offset (need ${requiredCredits.toFixed(
          2
        )} days, have ${bal.available.toFixed(2)} days).`,
      };
    }

    if (bal.ledgerRowId) {
      const nextUsed = Number((bal.usedDays + requiredCredits).toFixed(4));
      const { error: balErr } = await admin
        .from("employee_leave_balances")
        .update({
          used_days: nextUsed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bal.ledgerRowId);
      if (balErr) {
        return { success: false, error: `Failed to deduct VL balance: ${balErr.message}` };
      }
    } else if (bal.legacyRowId && bal.legacyRemaining !== null) {
      const nextRemaining = Math.max(
        0,
        Number((bal.legacyRemaining - requiredCredits).toFixed(4))
      );
      const { error: legErr } = await admin
        .from("leave_balances")
        .update({ remaining_days: nextRemaining })
        .eq("id", bal.legacyRowId);
      if (legErr) {
        return { success: false, error: `Failed to deduct VL balance: ${legErr.message}` };
      }
    } else {
      return {
        success: false,
        error: "No active Vacation Leave balance found for this employee.",
      };
    }

    creditsDeducted = requiredCredits;
  }

  const nowIso = new Date().toISOString();
  const nextStatus = payload.decision === "approve" ? "approved" : "rejected";

  const { error: updateErr } = await admin
    .from("undertime_requests")
    .update({
      status: nextStatus,
      hr_acted_at: nowIso,
      hr_reviewer_id: ctx.id,
      leave_credits_deducted: creditsDeducted,
      rejection_reason: payload.decision === "reject" ? cleanRejection : null,
      updated_at: nowIso,
    })
    .eq("id", reqRow.id)
    .eq("status", "pending_hr");

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  try {
    const typeLabel = formatUndertimeTypeLabel(reqRow.undertime_type);
    const { data: emp } = await admin
      .from("employees")
      .select("profile_id")
      .eq("id", reqRow.employee_id)
      .maybeSingle<{ profile_id: string | null }>();

    if (emp?.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: emp.profile_id,
        sender_id: ctx.id,
        type: "general",
        title:
          payload.decision === "approve"
            ? `${typeLabel} Verified & Approved`
            : `${typeLabel} Rejected by HR`,
        body:
          payload.decision === "approve"
            ? `Your ${typeLabel} for ${reqRow.work_date} (${reqRow.undertime_minutes}m${
                creditsDeducted > 0 ? `, -${creditsDeducted.toFixed(2)}d VL` : ""
              }) has been verified and logged by HR.`
            : `Your ${typeLabel} for ${reqRow.work_date} was declined by HR. Reason: ${cleanRejection}`,
        action_url: "/employee/schedule",
      });
    }
  } catch (notifErr) {
    console.error("hrReviewUndertimeAction notification warning:", notifErr);
  }

  revalidateUndertimeRoutes();
  return {
    success: true,
    message:
      payload.decision === "approve"
        ? creditsDeducted > 0
          ? `Undertime verified and ${creditsDeducted.toFixed(2)}d VL deducted.`
          : "Undertime verified and logged for payroll."
        : "Undertime request rejected.",
  };
}

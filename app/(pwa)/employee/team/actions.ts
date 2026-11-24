"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  ALL_WEEK_DAYS_SHORT,
  formatScheduleTime12h,
  getCurrentManilaWeekStart,
  normalizeShortWorkDays,
} from "@/lib/schedule-policy";
import {
  POOL_DEDUCTIBLE_LEDGER_TYPES,
  toLedgerLeaveCode,
} from "@/lib/leave-policy";
import { validateAndClassifyOvertimeRequest } from "@/lib/shift-calculations";

export interface SaveWorkModeOverrideResult {
  ok: boolean;
  error?: string;
}

export async function saveWorkModeOverrideAction(
  formData: FormData,
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const mode = String(formData.get("override_mode") ?? "")
    .trim()
    .toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!employeeId) {
    return { ok: false, error: "Employee ID is required." };
  }

  if (mode !== "onsite" && mode !== "wfh" && mode !== "clear") {
    return { ok: false, error: "Invalid work mode selection." };
  }

  if (mode !== "clear" && reason.length < 3) {
    return {
      ok: false,
      error: "Please enter a brief reason (at least 3 characters).",
    };
  }

  const admin = getAdminClient();

  const { data: supervisorEmployee } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmployee) {
    return { ok: false, error: "Active supervisor profile not found." };
  }

  const { data: targetEmployee } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, employment_status, profile:profiles!profile_id(first_name, last_name)",
    )
    .eq("id", employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      employment_status: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (!targetEmployee) {
    return { ok: false, error: "Direct report not found." };
  }

  if (
    targetEmployee.reports_to !== supervisorEmployee.id ||
    targetEmployee.employment_status !== "active"
  ) {
    return {
      ok: false,
      error: "Forbidden: you can only override work mode for your active direct reports.",
    };
  }

  const todayPht = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });

  if (mode === "clear") {
    const { error: deleteErr } = await admin
      .from("employee_work_mode_overrides")
      .delete()
      .eq("employee_id", employeeId)
      .eq("effective_date", todayPht);

    if (deleteErr) {
      return { ok: false, error: deleteErr.message };
    }

    revalidatePath("/employee/team");
    revalidatePath("/employee/schedule");
    revalidatePath("/employee/dashboard");
    return { ok: true };
  }

  const tenantId = targetEmployee.tenant_id ?? supervisorEmployee.tenant_id;
  if (!tenantId) {
    return { ok: false, error: "Tenant ID is missing for this employee." };
  }

  const { error: upsertErr } = await admin
    .from("employee_work_mode_overrides")
    .upsert(
      {
        tenant_id: tenantId,
        employee_id: employeeId,
        effective_date: todayPht,
        override_mode: mode,
        reason,
        approved_by_profile_id: user.id,
      },
      { onConflict: "employee_id,effective_date" },
    );

  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }

  const modeLabel = mode === "wfh" ? "WFH (Emergency)" : "Onsite (Emergency)";
  const empProfile = Array.isArray(targetEmployee.profile)
    ? targetEmployee.profile[0]
    : targetEmployee.profile;
  const empName =
    [empProfile?.first_name, empProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Direct Report";

  // Notify employee + tenant HR Admins/Generalists (best-effort)
  try {
    const notifications: Array<{
      recipient_id: string;
      sender_id: string;
      type: string;
      title: string;
      body: string;
      action_url: string;
    }> = [];

    if (targetEmployee.profile_id) {
      notifications.push({
        recipient_id: targetEmployee.profile_id,
        sender_id: user.id,
        type: "schedule_published",
        title: `Today's Work Mode Updated: ${modeLabel}`,
        body: `Your supervisor set today's (${todayPht}) work mode to ${modeLabel}. Reason: ${reason}`,
        action_url: "/employee/schedule",
      });
    }

    const { data: hrRecipients } = await admin
      .from("profiles")
      .select("id, hr_role, is_tenant_owner")
      .eq("tenant_id", tenantId)
      .in("role", ["hr_manager", "hr", "admin"]);

    for (const hr of hrRecipients ?? []) {
      const hrRow = hr as {
        id: string;
        hr_role?: string | null;
        is_tenant_owner?: boolean | null;
      };
      if (hrRow.id === user.id) continue;
      const effectiveHrRole = hrRow.hr_role ?? "hr_admin";
      if (
        hrRow.is_tenant_owner ||
        effectiveHrRole === "hr_admin" ||
        effectiveHrRole === "hr_generalist"
      ) {
        notifications.push({
          recipient_id: hrRow.id,
          sender_id: user.id,
          type: "schedule_published",
          title: `Supervisor Work Mode Override: ${empName}`,
          body: `${empName}'s work mode for ${todayPht} was overridden to ${modeLabel}. Reason: ${reason}`,
          action_url: `/hr/employees/${employeeId}`,
        });
      }
    }

    if (notifications.length > 0) {
      await admin.from("notifications").insert(notifications);
    }
  } catch (notifErr) {
    console.error("saveWorkModeOverrideAction notification error:", notifErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/employee/dashboard");

  return { ok: true };
}

export type DayWorkMode = "onsite" | "wfh" | "rest";
export type DailyWorkModesMap = Record<string, DayWorkMode>;

export interface UpdateDirectReportScheduleInput {
  employeeId: string;
  shiftStart: string;
  shiftEnd: string;
  workDays: string[];
  workMode?: "onsite" | "wfh" | "hybrid";
  dailyWorkModes?: DailyWorkModesMap;
}

function formatDayRanges(days: string[]): string {
  const ordered = ALL_WEEK_DAYS_SHORT.filter((d) => days.includes(d));
  if (ordered.length === 0) return "";
  const indices = ordered.map((d) => ALL_WEEK_DAYS_SHORT.indexOf(d));
  const parts: string[] = [];
  let start = indices[0];
  let prev = indices[0];

  for (let i = 1; i <= indices.length; i += 1) {
    const curr = indices[i];
    if (curr === prev + 1) {
      prev = curr;
      continue;
    }
    if (prev - start >= 2) {
      parts.push(`${ALL_WEEK_DAYS_SHORT[start]}–${ALL_WEEK_DAYS_SHORT[prev]}`);
    } else if (prev - start === 1) {
      parts.push(`${ALL_WEEK_DAYS_SHORT[start]}, ${ALL_WEEK_DAYS_SHORT[prev]}`);
    } else {
      parts.push(ALL_WEEK_DAYS_SHORT[start]);
    }
    start = curr;
    prev = curr;
  }
  return parts.join(", ");
}

function summarizeDailyWorkModes(dailyModes: DailyWorkModesMap): string {
  const onsiteDays = ALL_WEEK_DAYS_SHORT.filter((d) => dailyModes[d] === "onsite");
  const wfhDays = ALL_WEEK_DAYS_SHORT.filter((d) => dailyModes[d] === "wfh");
  const segments: string[] = [];
  if (onsiteDays.length > 0) {
    segments.push(`${formatDayRanges(onsiteDays)} Onsite`);
  }
  if (wfhDays.length > 0) {
    segments.push(`${formatDayRanges(wfhDays)} WFH`);
  }
  return segments.join(", ");
}

export async function updateDirectReportScheduleAction(
  input: UpdateDirectReportScheduleInput,
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const employeeId = String(input.employeeId ?? "").trim();
  const shiftStart = String(input.shiftStart ?? "").trim().slice(0, 5);
  const shiftEnd = String(input.shiftEnd ?? "").trim().slice(0, 5);

  const normalizedDailyModes: DailyWorkModesMap = {};
  const hasDailyModesInput =
    Boolean(input.dailyWorkModes) && Object.keys(input.dailyWorkModes ?? {}).length > 0;

  if (hasDailyModesInput) {
    for (const day of ALL_WEEK_DAYS_SHORT) {
      const raw = String(input.dailyWorkModes?.[day] ?? "rest")
        .trim()
        .toLowerCase();
      normalizedDailyModes[day] =
        raw === "onsite" || raw === "wfh" ? raw : "rest";
    }
  }

  const selectedDays = hasDailyModesInput
    ? ALL_WEEK_DAYS_SHORT.filter(
        (day) =>
          normalizedDailyModes[day] === "onsite" ||
          normalizedDailyModes[day] === "wfh",
      )
    : normalizeShortWorkDays(input.workDays);

  if (!employeeId) {
    return { ok: false, error: "Employee ID is required." };
  }

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(shiftStart) || !timePattern.test(shiftEnd)) {
    return { ok: false, error: "Please provide valid shift start and end times (HH:MM)." };
  }

  if (selectedDays.length < 1) {
    return { ok: false, error: "Select at least 1 working day." };
  }

  if (selectedDays.length > 6) {
    return {
      ok: false,
      error: "DOLE compliance requires at least 1 rest day per week (maximum 6 working days).",
    };
  }

  const admin = getAdminClient();

  const { data: supervisorEmployee } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmployee) {
    return { ok: false, error: "Active supervisor profile not found." };
  }

  const { data: targetEmployee } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, employment_status, work_mode, job_offer_id, profile:profiles!profile_id(first_name, last_name)",
    )
    .eq("id", employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      employment_status: string | null;
      work_mode: string | null;
      job_offer_id: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (!targetEmployee) {
    return { ok: false, error: "Direct report not found." };
  }

  if (
    targetEmployee.reports_to !== supervisorEmployee.id ||
    targetEmployee.employment_status !== "active"
  ) {
    return {
      ok: false,
      error: "Forbidden: you can only update schedules for your active direct reports.",
    };
  }

  // Enforce contracted work_days_per_week if specified on the employee's job offer
  if (targetEmployee.job_offer_id) {
    const { data: offerRow } = await admin
      .from("job_offers")
      .select("job_metadata")
      .eq("id", targetEmployee.job_offer_id)
      .maybeSingle<{ job_metadata?: Record<string, unknown> | null }>();
    const rawContracted = offerRow?.job_metadata?.work_days_per_week;
    const contractedDays =
      rawContracted !== null && rawContracted !== undefined ? Number(rawContracted) : null;
    if (
      contractedDays !== null &&
      Number.isFinite(contractedDays) &&
      contractedDays >= 1 &&
      contractedDays <= 6 &&
      selectedDays.length !== contractedDays
    ) {
      return {
        ok: false,
        error: `Contracted schedule requires ${contractedDays} working days per week (currently selected ${selectedDays.length}).`,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const weekStart = getCurrentManilaWeekStart();
  const restDays = ALL_WEEK_DAYS_SHORT.filter((d) => !selectedDays.includes(d));

  const requestedWorkMode = input.workMode
    ? String(input.workMode).trim().toLowerCase()
    : null;
  let normalizedWorkMode: "onsite" | "wfh" | "hybrid" | null =
    requestedWorkMode === "onsite" ||
    requestedWorkMode === "wfh" ||
    requestedWorkMode === "hybrid"
      ? requestedWorkMode
      : null;

  if (hasDailyModesInput) {
    const hasOnsite = selectedDays.some((d) => normalizedDailyModes[d] === "onsite");
    const hasWfh = selectedDays.some((d) => normalizedDailyModes[d] === "wfh");
    if (hasOnsite && hasWfh) {
      normalizedWorkMode = "hybrid";
    } else if (hasWfh) {
      normalizedWorkMode = "wfh";
    } else if (hasOnsite) {
      normalizedWorkMode = "onsite";
    }
  }

  const finalDailyModes: DailyWorkModesMap = {};
  const defaultActiveDayMode: "onsite" | "wfh" =
    (normalizedWorkMode ?? targetEmployee.work_mode ?? "onsite")
      .trim()
      .toLowerCase() === "wfh"
      ? "wfh"
      : "onsite";
  for (const day of ALL_WEEK_DAYS_SHORT) {
    if (hasDailyModesInput) {
      finalDailyModes[day] = normalizedDailyModes[day];
    } else {
      finalDailyModes[day] = selectedDays.includes(day)
        ? defaultActiveDayMode
        : "rest";
    }
  }

  const employeeUpdatePayload: Record<string, unknown> = {
    shift_start: shiftStart,
    shift_end: shiftEnd,
    work_days: selectedDays,
    daily_work_modes: finalDailyModes,
    updated_at: nowIso,
  };
  if (normalizedWorkMode) {
    employeeUpdatePayload.work_mode = normalizedWorkMode;
  }

  const { error: empErr } = await admin
    .from("employees")
    .update(employeeUpdatePayload)
    .eq("id", employeeId);

  if (empErr) {
    if (/daily_work_modes/i.test(empErr.message)) {
      const retryPayload = { ...employeeUpdatePayload };
      delete retryPayload.daily_work_modes;
      const { error: retryEmpErr } = await admin
        .from("employees")
        .update(retryPayload)
        .eq("id", employeeId);
      if (retryEmpErr) {
        return { ok: false, error: retryEmpErr.message };
      }
    } else {
      return { ok: false, error: empErr.message };
    }
  }

  const effectiveWorkMode = (
    normalizedWorkMode ??
    targetEmployee.work_mode ??
    "onsite"
  )
    .trim()
    .toLowerCase();
  const resolvedLocation =
    effectiveWorkMode === "remote" || effectiveWorkMode === "wfh"
      ? "remote"
      : effectiveWorkMode === "hybrid"
        ? "hybrid"
        : "office";
  const dailySplitSummary = summarizeDailyWorkModes(finalDailyModes);
  const workModeLabel =
    dailySplitSummary ||
    (effectiveWorkMode === "wfh" || effectiveWorkMode === "remote"
      ? "WFH"
      : effectiveWorkMode === "hybrid"
        ? "Hybrid"
        : "Onsite");

  const fullSchedulePayload: Record<string, unknown> = {
    employee_id: employeeId,
    week_start: weekStart,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    work_days: selectedDays,
    daily_work_modes: finalDailyModes,
    location: resolvedLocation,
    is_published: true,
    created_by: user.id,
    updated_at: nowIso,
  };

  const { error: schedErr } = await admin
    .from("schedules")
    .upsert(fullSchedulePayload, { onConflict: "employee_id,week_start" });

  if (schedErr) {
    const isSchemaColumnMismatch =
      /Could not find the '([^']+)' column of 'schedules'|column .* does not exist/i.test(
        schedErr.message,
      );
    if (isSchemaColumnMismatch) {
      const fallbackPayload: Record<string, unknown> = {
        employee_id: employeeId,
        week_start: weekStart,
        location: resolvedLocation,
        is_published: true,
        created_by: user.id,
        updated_at: nowIso,
      };
      if (!/work_days/i.test(schedErr.message)) {
        fallbackPayload.work_days = selectedDays;
      }
      if (!/daily_work_modes/i.test(schedErr.message)) {
        fallbackPayload.daily_work_modes = finalDailyModes;
      }
      if (!/shift_start/i.test(schedErr.message)) {
        fallbackPayload.shift_start = shiftStart;
      }
      if (!/shift_end/i.test(schedErr.message)) {
        fallbackPayload.shift_end = shiftEnd;
      }

      const { error: fallbackErr } = await admin
        .from("schedules")
        .upsert(fallbackPayload, { onConflict: "employee_id,week_start" });

      if (fallbackErr) {
        console.warn(
          "updateDirectReportScheduleAction: schedules fallback upsert skipped due to schema mismatch:",
          fallbackErr.message,
        );
      }
    } else {
      return { ok: false, error: schedErr.message };
    }
  }

  const empProfile = Array.isArray(targetEmployee.profile)
    ? targetEmployee.profile[0]
    : targetEmployee.profile;
  const empName =
    [empProfile?.first_name, empProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Direct Report";

  const shiftLabel = `${formatScheduleTime12h(shiftStart)} – ${formatScheduleTime12h(shiftEnd)}`;
  const workDaysLabel = selectedDays.join(", ");
  const restDaysLabel = restDays.length > 0 ? restDays.join(", ") : "None";

  const tenantId = targetEmployee.tenant_id ?? supervisorEmployee.tenant_id;
  try {
    const notifications: Array<{
      recipient_id: string;
      sender_id: string;
      type: string;
      title: string;
      body: string;
      action_url: string;
    }> = [];

    if (targetEmployee.profile_id) {
      notifications.push({
        recipient_id: targetEmployee.profile_id,
        sender_id: user.id,
        type: "schedule_published",
        title: `Weekly Shift Updated: ${shiftLabel}`,
        body: `Your supervisor updated your weekly roster (week of ${weekStart}): Shift ${shiftLabel} • Work Mode: ${workModeLabel} • Work Days: ${workDaysLabel} • Rest Days: ${restDaysLabel}.`,
        action_url: "/employee/schedule",
      });
    }

    if (tenantId) {
      const { data: hrRecipients } = await admin
        .from("profiles")
        .select("id, hr_role, is_tenant_owner")
        .eq("tenant_id", tenantId)
        .in("role", ["hr_manager", "hr", "admin"]);

      for (const hr of hrRecipients ?? []) {
        const hrRow = hr as {
          id: string;
          hr_role?: string | null;
          is_tenant_owner?: boolean | null;
        };
        if (hrRow.id === user.id) continue;
        const effectiveHrRole = hrRow.hr_role ?? "hr_admin";
        if (
          hrRow.is_tenant_owner ||
          effectiveHrRole === "hr_admin" ||
          effectiveHrRole === "hr_generalist"
        ) {
          notifications.push({
            recipient_id: hrRow.id,
            sender_id: user.id,
            type: "schedule_published",
            title: `Supervisor Roster Update: ${empName}`,
            body: `${empName}'s weekly roster (week of ${weekStart}) was updated: ${shiftLabel} • Work Mode: ${workModeLabel} • Work Days: ${workDaysLabel} • Rest Days: ${restDaysLabel}.`,
            action_url: `/hr/employees/${employeeId}`,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await admin.from("notifications").insert(notifications);
    }
  } catch (notifErr) {
    console.error("updateDirectReportScheduleAction notification error:", notifErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/employee/dashboard");
  revalidatePath("/hr/schedules");

  return { ok: true };
}

export interface SupervisorReviewDecisionInput {
  requestId: string;
  decision: "approve" | "reject";
  remarks?: string;
}

async function notifyTenantHrForApproval(params: {
  admin: ReturnType<typeof getAdminClient>;
  tenantId: string | null;
  senderId: string;
  title: string;
  body: string;
  actionUrl: string;
}) {
  const { admin, tenantId, senderId, title, body, actionUrl } = params;
  let query = admin
    .from("profiles")
    .select("id, hr_role, is_tenant_owner")
    .in("role", ["hr_manager", "hr", "admin"]);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: hrRecipients } = await query;
  const targetIds = (hrRecipients ?? [])
    .filter((row) => {
      const hr = row as {
        id: string;
        hr_role?: string | null;
        is_tenant_owner?: boolean | null;
      };
      if (hr.id === senderId) return false;
      const effectiveRole = hr.hr_role ?? "hr_admin";
      return (
        Boolean(hr.is_tenant_owner) ||
        effectiveRole === "hr_admin" ||
        effectiveRole === "hr_generalist"
      );
    })
    .map((r) => (r as { id: string }).id);

  if (targetIds.length > 0) {
    await admin.from("notifications").insert(
      targetIds.map((recipient_id) => ({
        recipient_id,
        sender_id: senderId,
        type: "general",
        title,
        body,
        action_url: actionUrl,
      }))
    );
  }
}

export async function reviewTeamLeaveRequestAction(
  input: SupervisorReviewDecisionInput
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const requestId = String(input.requestId ?? "").trim();
  const remarks = String(input.remarks ?? "").trim();
  if (!requestId) return { ok: false, error: "Leave request ID is required." };
  if (input.decision === "reject" && remarks.length < 3) {
    return { ok: false, error: "Please provide a reason for rejecting this leave request." };
  }

  const admin = getAdminClient();
  const { data: supervisorEmp } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmp) {
    return { ok: false, error: "Active supervisor employee record not found." };
  }

  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, total_days, status")
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      employee_id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      total_days: number | null;
      status: string;
    }>();

  if (!leave) return { ok: false, error: "Leave request not found." };
  if (!["pending_supervisor", "pending"].includes(leave.status)) {
    return { ok: false, error: `Request is already ${leave.status}.` };
  }

  const { data: targetEmp } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, profile:profiles!profile_id(first_name, last_name)"
    )
    .eq("id", leave.employee_id)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  const sameTenant =
    !supervisorEmp.tenant_id ||
    !targetEmp?.tenant_id ||
    supervisorEmp.tenant_id === targetEmp.tenant_id;

  if (!targetEmp || targetEmp.reports_to !== supervisorEmp.id || !sameTenant) {
    return {
      ok: false,
      error: "Forbidden: you can only review requests from your direct reports.",
    };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = input.decision === "approve" ? "pending_hr" : "rejected";

  const { error: updateErr } = await admin
    .from("leave_requests")
    .update({
      status: nextStatus,
      supervisor_id: supervisorEmp.id,
      supervisor_action_at: nowIso,
      supervisor_remarks: remarks || null,
      updated_at: nowIso,
    })
    .eq("id", leave.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // On rejection, release pending_days in employee_leave_balances
  if (input.decision === "reject") {
    const startMs = Date.parse(`${leave.start_date}T00:00:00Z`);
    const endMs = Date.parse(`${leave.end_date}T00:00:00Z`);
    const daysCount =
      typeof leave.total_days === "number" && leave.total_days > 0
        ? leave.total_days
        : Number.isFinite(startMs) && Number.isFinite(endMs)
          ? Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
          : 0;
    const year = leave.start_date
      ? new Date(`${leave.start_date}T00:00:00Z`).getFullYear()
      : new Date().getFullYear();
    const ledgerType = toLedgerLeaveCode(leave.leave_type ?? "");

    if (ledgerType && POOL_DEDUCTIBLE_LEDGER_TYPES.has(ledgerType) && daysCount > 0) {
      const { data: ledgerRow } = await admin
        .from("employee_leave_balances")
        .select("id, pending_days")
        .eq("employee_id", leave.employee_id)
        .eq("year", year)
        .eq("leave_type", ledgerType)
        .maybeSingle<{ id: string; pending_days: number }>();

      if (ledgerRow) {
        await admin
          .from("employee_leave_balances")
          .update({
            pending_days: Math.max(0, Number(ledgerRow.pending_days ?? 0) - daysCount),
            updated_at: nowIso,
          })
          .eq("id", ledgerRow.id);
      }
    }
  }

  const empProf = Array.isArray(targetEmp.profile)
    ? targetEmp.profile[0]
    : targetEmp.profile;
  const empName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
    "Direct Report";

  try {
    if (input.decision === "approve") {
      if (targetEmp.profile_id) {
        await admin.from("notifications").insert({
          recipient_id: targetEmp.profile_id,
          sender_id: user.id,
          type: "general",
          title: "Leave Approved by Supervisor (Forwarded to HR)",
          body: `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was endorsed by your supervisor and forwarded to HR for final approval.`,
          action_url: "/employee/leaves",
        });
      }
      await notifyTenantHrForApproval({
        admin,
        tenantId: targetEmp.tenant_id ?? supervisorEmp.tenant_id,
        senderId: user.id,
        title: "Leave Request Ready for HR Final Approval",
        body: `${empName}'s ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was approved by their supervisor.${remarks ? ` Note: ${remarks}` : ""}`,
        actionUrl: "/hr/leaves",
      });
    } else if (targetEmp.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: targetEmp.profile_id,
        sender_id: user.id,
        type: "general",
        title: "Leave Request Rejected by Supervisor",
        body: `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was declined by your supervisor. Reason: ${remarks}`,
        action_url: "/employee/leaves",
      });
    }
  } catch (notifyErr) {
    console.error("reviewTeamLeaveRequestAction notification error:", notifyErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/leaves");
  revalidatePath("/hr/leaves");
  return { ok: true };
}

export async function reviewTeamOvertimeRequestAction(
  input: SupervisorReviewDecisionInput
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const requestId = String(input.requestId ?? "").trim();
  const remarks = String(input.remarks ?? "").trim();
  if (!requestId) return { ok: false, error: "Overtime request ID is required." };
  if (input.decision === "reject" && remarks.length < 3) {
    return { ok: false, error: "Please provide a reason for rejecting this overtime request." };
  }

  const admin = getAdminClient();
  const { data: supervisorEmp } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmp) {
    return { ok: false, error: "Active supervisor employee record not found." };
  }

  const { data: ot } = await admin
    .from("overtime_requests")
    .select("id, employee_id, work_date, start_time, end_time, status")
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      employee_id: string;
      work_date: string;
      start_time: string;
      end_time: string;
      status: string;
    }>();

  if (!ot) return { ok: false, error: "Overtime request not found." };
  if (!["pending_supervisor", "pending"].includes(ot.status)) {
    return { ok: false, error: `Overtime request is already ${ot.status}.` };
  }

  const { data: targetEmp } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, profile:profiles!profile_id(first_name, last_name)"
    )
    .eq("id", ot.employee_id)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  const sameTenant =
    !supervisorEmp.tenant_id ||
    !targetEmp?.tenant_id ||
    supervisorEmp.tenant_id === targetEmp.tenant_id;

  if (!targetEmp || targetEmp.reports_to !== supervisorEmp.id || !sameTenant) {
    return {
      ok: false,
      error: "Forbidden: you can only review overtime requests from your direct reports.",
    };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = input.decision === "approve" ? "pending_hr" : "rejected";

  const { error: updateErr } = await admin
    .from("overtime_requests")
    .update({
      status: nextStatus,
      supervisor_id: supervisorEmp.id,
      supervisor_action_at: nowIso,
      supervisor_remarks: remarks || null,
    })
    .eq("id", ot.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  const empProf = Array.isArray(targetEmp.profile)
    ? targetEmp.profile[0]
    : targetEmp.profile;
  const empName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
    "Direct Report";

  try {
    if (input.decision === "approve") {
      if (targetEmp.profile_id) {
        await admin.from("notifications").insert({
          recipient_id: targetEmp.profile_id,
          sender_id: user.id,
          type: "general",
          title: "Overtime Approved by Supervisor (Forwarded to HR)",
          body: `Your overtime request for ${ot.work_date} (${ot.start_time.slice(0, 5)}–${ot.end_time.slice(0, 5)}) was endorsed by your supervisor and forwarded to HR.`,
          action_url: "/employee/schedule",
        });
      }
      await notifyTenantHrForApproval({
        admin,
        tenantId: targetEmp.tenant_id ?? supervisorEmp.tenant_id,
        senderId: user.id,
        title: "Overtime Request Ready for HR Final Approval",
        body: `${empName}'s overtime request for ${ot.work_date} (${ot.start_time.slice(0, 5)}–${ot.end_time.slice(0, 5)}) was approved by their supervisor.${remarks ? ` Note: ${remarks}` : ""}`,
        actionUrl: "/hr/attendance",
      });
    } else if (targetEmp.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: targetEmp.profile_id,
        sender_id: user.id,
        type: "general",
        title: "Overtime Request Rejected by Supervisor",
        body: `Your overtime request for ${ot.work_date} was declined by your supervisor. Reason: ${remarks}`,
        action_url: "/employee/schedule",
      });
    }
  } catch (notifyErr) {
    console.error("reviewTeamOvertimeRequestAction notification error:", notifyErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return { ok: true };
}

export async function reviewTeamWorkModeRequestAction(
  input: SupervisorReviewDecisionInput
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const requestId = String(input.requestId ?? "").trim();
  const remarks = String(input.remarks ?? "").trim();
  if (!requestId) return { ok: false, error: "Work mode request ID is required." };
  if (input.decision === "reject" && remarks.length < 3) {
    return {
      ok: false,
      error: "Please provide a reason for rejecting this work mode request.",
    };
  }

  const admin = getAdminClient();
  const { data: supervisorEmp } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmp) {
    return { ok: false, error: "Active supervisor employee record not found." };
  }

  const { data: reqRow } = await admin
    .from("work_mode_requests")
    .select("id, tenant_id, employee_id, request_date, requested_mode, reason, status")
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      employee_id: string;
      request_date: string;
      requested_mode: "onsite" | "wfh";
      reason: string;
      status: string;
    }>();

  if (!reqRow) return { ok: false, error: "Work mode request not found." };
  if (reqRow.status !== "pending_supervisor") {
    return { ok: false, error: `Work mode request is already ${reqRow.status}.` };
  }

  const { data: targetEmp } = await admin
    .from("employees")
    .select("id, tenant_id, profile_id, reports_to")
    .eq("id", reqRow.employee_id)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
    }>();

  const sameTenant =
    !supervisorEmp.tenant_id ||
    !targetEmp?.tenant_id ||
    supervisorEmp.tenant_id === targetEmp.tenant_id;

  if (!targetEmp || targetEmp.reports_to !== supervisorEmp.id || !sameTenant) {
    return {
      ok: false,
      error: "Forbidden: you can only review work mode requests from your direct reports.",
    };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = input.decision === "approve" ? "approved" : "rejected";

  const { error: updateErr } = await admin
    .from("work_mode_requests")
    .update({
      status: nextStatus,
      supervisor_id: supervisorEmp.id,
      reviewed_at: nowIso,
      reviewer_remarks: remarks || null,
      updated_at: nowIso,
    })
    .eq("id", reqRow.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  if (input.decision === "approve") {
    const tenantId = reqRow.tenant_id ?? targetEmp.tenant_id ?? supervisorEmp.tenant_id;
    if (tenantId) {
      await admin.from("employee_work_mode_overrides").upsert(
        {
          tenant_id: tenantId,
          employee_id: reqRow.employee_id,
          effective_date: reqRow.request_date,
          override_mode: reqRow.requested_mode,
          reason: reqRow.reason,
          approved_by_profile_id: user.id,
        },
        { onConflict: "employee_id,effective_date" }
      );
    }
  }

  if (targetEmp.profile_id) {
    const modeLabel = reqRow.requested_mode === "wfh" ? "WFH" : "Onsite";
    await admin.from("notifications").insert({
      recipient_id: targetEmp.profile_id,
      sender_id: user.id,
      type: "schedule_published",
      title:
        input.decision === "approve"
          ? `Work Mode Change Approved (${modeLabel})`
          : "Work Mode Change Request Declined",
      body:
        input.decision === "approve"
          ? `Your supervisor approved ${modeLabel} for ${reqRow.request_date}. You can now clock in under ${modeLabel}.`
          : `Your ${modeLabel} request for ${reqRow.request_date} was declined. Reason: ${remarks}`,
      action_url: "/employee/schedule",
    });
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/employee/dashboard");
  return { ok: true };
}

export interface AssignTeamOvertimeInput {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  overtimeType?: "regular_ot" | "rdot";
  reason: string;
}

export async function assignTeamOvertimeAction(
  input: AssignTeamOvertimeInput
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const employeeId = String(input.employeeId ?? "").trim();
  const workDate = String(input.workDate ?? "").trim();
  const startTime = String(input.startTime ?? "").trim();
  const endTime = String(input.endTime ?? "").trim();
  const overtimeType: "regular_ot" | "rdot" =
    input.overtimeType === "rdot" ? "rdot" : "regular_ot";
  const reason = String(input.reason ?? "").trim();

  if (!employeeId) return { ok: false, error: "Employee ID is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, error: "Please select a valid work date." };
  }
  if (reason.length < 5) {
    return { ok: false, error: "Please enter a brief reason (at least 5 characters)." };
  }

  const admin = getAdminClient();
  const { data: supervisorEmp } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmp) {
    return { ok: false, error: "Active supervisor employee record not found." };
  }

  const { data: targetEmp } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, employment_status, work_days, daily_work_modes, shift_start, shift_end, profile:profiles!profile_id(first_name, last_name)"
    )
    .eq("id", employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      employment_status: string | null;
      work_days?: string[] | null;
      daily_work_modes?: Record<string, string | null | undefined> | null;
      shift_start?: string | null;
      shift_end?: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (
    !targetEmp ||
    targetEmp.reports_to !== supervisorEmp.id ||
    targetEmp.employment_status !== "active"
  ) {
    return {
      ok: false,
      error: "Forbidden: you can only assign overtime to your active direct reports.",
    };
  }

  const { data: latestSchedule } = await admin
    .from("schedules")
    .select("shift_start, shift_end, work_days, daily_work_modes")
    .eq("employee_id", targetEmp.id)
    .eq("is_published", true)
    .lte("week_start", workDate)
    .order("week_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      shift_start?: string | null;
      shift_end?: string | null;
      work_days?: string[] | null;
      daily_work_modes?: Record<string, string | null | undefined> | null;
    }>();

  const guardrail = validateAndClassifyOvertimeRequest({
    workDate,
    startTime,
    endTime,
    requestedType: input.overtimeType ?? null,
    workDays:
      Array.isArray(latestSchedule?.work_days) && latestSchedule.work_days.length > 0
        ? latestSchedule.work_days
        : targetEmp.work_days ?? null,
    dailyWorkModes:
      latestSchedule?.daily_work_modes &&
      Object.keys(latestSchedule.daily_work_modes).length > 0
        ? latestSchedule.daily_work_modes
        : targetEmp.daily_work_modes ?? null,
    shiftStart: latestSchedule?.shift_start ?? targetEmp.shift_start ?? "08:00",
    shiftEnd: latestSchedule?.shift_end ?? targetEmp.shift_end ?? "17:00",
  });

  if (!guardrail.valid) {
    return { ok: false, error: guardrail.error || "Invalid overtime request." };
  }

  const resolvedOvertimeType = guardrail.resolvedType;

  const nowIso = new Date().toISOString();
  const tenantId = targetEmp.tenant_id ?? supervisorEmp.tenant_id;

  let { error: insertErr } = await admin.from("overtime_requests").insert({
    tenant_id: tenantId,
    employee_id: targetEmp.id,
    work_date: workDate,
    start_time: startTime,
    end_time: endTime,
    overtime_type: resolvedOvertimeType,
    reason,
    status: "pending_hr",
    supervisor_id: supervisorEmp.id,
    supervisor_action_at: nowIso,
    supervisor_remarks: "Assigned by Direct Supervisor",
    requested_by: user.id,
  });

  if (
    insertErr &&
    /overtime_type|supervisor_id|check constraint|invalid input value/i.test(insertErr.message)
  ) {
    const fallbackInsert = await admin.from("overtime_requests").insert({
      tenant_id: tenantId,
      employee_id: targetEmp.id,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      reason,
      status: "pending",
      requested_by: user.id,
    });
    insertErr = fallbackInsert.error;
  }

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  const empProf = Array.isArray(targetEmp.profile)
    ? targetEmp.profile[0]
    : targetEmp.profile;
  const empName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
    "Direct Report";

  try {
    if (targetEmp.profile_id) {
      await admin.from("notifications").insert({
        recipient_id: targetEmp.profile_id,
        sender_id: user.id,
        type: "general",
        title: "Overtime Assigned by Supervisor (Pending HR)",
        body: `Your supervisor filed overtime for ${workDate} (${startTime}–${endTime}). Awaiting HR final sign-off.`,
        action_url: "/employee/schedule",
      });
    }
    await notifyTenantHrForApproval({
      admin,
      tenantId,
      senderId: user.id,
      title: `Supervisor-Assigned Overtime: ${empName}`,
      body: `${empName} was assigned overtime for ${workDate} (${startTime}–${endTime}) by their supervisor. Reason: ${reason}`,
      actionUrl: "/hr/attendance",
    });
  } catch (notifyErr) {
    console.error("assignTeamOvertimeAction notification error:", notifyErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return { ok: true };
}

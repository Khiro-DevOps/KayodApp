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

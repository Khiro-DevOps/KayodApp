"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import {
  buildHybridScheduleNotes,
  buildStandardScheduleNotes,
  DEFAULT_LUNCH_END,
  DEFAULT_LUNCH_START,
  normalizeDaysToFull,
} from "@/lib/hybrid-schedule";

export interface SaveAndPublishScheduleInput {
  employeeId: string;
  weekStart: string;
  shiftStart: string;
  shiftEnd: string;
  lunchStart?: string;
  lunchEnd?: string;
  workDays: string[];
  onsiteDays?: string[];
  wfhDays?: string[];
  workModel?: "onsite" | "wfh" | "hybrid";
  location?: string | null;
  notes?: string | null;
}

export async function saveAndPublishEmployeeSchedule(
  input: SaveAndPublishScheduleInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: hrProfile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = (hrProfile?.role ?? "").toLowerCase();
  if (!["hr", "hr_manager", "admin"].includes(role)) {
    return { success: false, error: "Forbidden: HR role required" };
  }

  const admin = getAdminClient();

  const { data: employee, error: empErr } = await admin
    .from("employees")
    .select("id, profile_id, profiles ( tenant_id )")
    .eq("id", input.employeeId)
    .maybeSingle();

  if (empErr || !employee) {
    return { success: false, error: "Employee not found" };
  }

  const empProfile = Array.isArray(employee.profiles)
    ? employee.profiles[0]
    : (employee.profiles as { tenant_id?: string | null } | null);

  const DEV_DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
  const isDevTenant =
    process.env.NODE_ENV === "development" ||
    empProfile?.tenant_id === DEV_DEFAULT_TENANT_ID;

  if (
    !isDevTenant &&
    hrProfile?.tenant_id &&
    empProfile?.tenant_id &&
    hrProfile.tenant_id !== empProfile.tenant_id
  ) {
    return { success: false, error: "Forbidden: employee belongs to another tenant" };
  }

  const nowIso = new Date().toISOString();
  const resolvedLocation =
    input.location ??
    (input.workModel === "wfh" ? "remote" : input.workModel === "hybrid" ? "hybrid" : "office");

  const isHybrid = input.workModel === "hybrid";
  const normalizedOnsite = isHybrid
    ? normalizeDaysToFull(input.onsiteDays ?? input.workDays)
    : normalizeDaysToFull(input.workDays);
  const normalizedWfh = isHybrid ? normalizeDaysToFull(input.wfhDays ?? []) : [];
  const combinedWorkDays = isHybrid
    ? normalizeDaysToFull([...normalizedOnsite, ...normalizedWfh])
    : normalizedOnsite;
  const lunchWindow = {
    lunchStart: input.lunchStart || DEFAULT_LUNCH_START,
    lunchEnd: input.lunchEnd || DEFAULT_LUNCH_END,
  };
  const resolvedNotes = isHybrid
    ? buildHybridScheduleNotes(input.notes, normalizedOnsite, normalizedWfh, lunchWindow)
    : buildStandardScheduleNotes(input.notes, lunchWindow);

  const { error: upsertErr } = await admin.from("schedules").upsert(
    {
      employee_id: input.employeeId,
      week_start: input.weekStart,
      shift_start: input.shiftStart,
      shift_end: input.shiftEnd,
      location: resolvedLocation,
      notes: resolvedNotes,
      is_published: true,
      created_by: user.id,
      updated_at: nowIso,
    },
    { onConflict: "employee_id,week_start" }
  );

  if (upsertErr) {
    return { success: false, error: upsertErr.message };
  }

  const employeeUpdate: Record<string, unknown> = {
    shift_start: input.shiftStart,
    shift_end: input.shiftEnd,
    work_days: combinedWorkDays,
    hybrid_onsite_days: normalizedOnsite,
    updated_at: nowIso,
  };
  if (input.workModel) {
    employeeUpdate.work_mode = input.workModel === "wfh" ? "remote" : input.workModel;
  }

  const { error: empUpdateErr } = await admin
    .from("employees")
    .update(employeeUpdate)
    .eq("id", input.employeeId);

  if (empUpdateErr) {
    return { success: false, error: empUpdateErr.message };
  }

  if (employee.profile_id) {
    await sendNotification({
      recipientId: employee.profile_id,
      type: "schedule_published",
      title: "Weekly Schedule Published",
      body: `Your shift schedule for the week of ${input.weekStart} (${input.shiftStart} - ${input.shiftEnd}) has been published.`,
      actionUrl: "/employee/schedule",
      senderId: user.id,
      actionName: "saveAndPublishEmployeeSchedule",
    });
  }

  revalidatePath("/hr/schedules");
  revalidatePath("/employee/schedule");

  return { success: true };
}

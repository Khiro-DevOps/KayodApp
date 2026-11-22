"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { calculateHaversineDistance } from "@/lib/haversine";
import { resolveEmployeeGeofence } from "@/lib/geofence-resolver";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import { resolveContractWorkSetup, resolveDailyWorkModel } from "@/lib/work-arrangement";

export type ClockInPayload = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  flag_reason?: string;
};

export type ClockInResult =
  | {
      success: true;
      message: string;
      logId: string;
      status: string;
      zone_status: string;
      location_used: string;
      distanceMeters: number | null;
      clockIn?: string;
      resumed?: boolean;
    }
  | {
      success: false;
      error: string;
      distanceMeters?: number;
      radiusMeters?: number;
      canReopen?: boolean;
      shiftCompletedToday?: boolean;
      closedLogId?: string;
    };

const UNDO_CLOCK_OUT_WINDOW_MS = 5 * 60 * 1000;

function getTodayLocalDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function getLogLocalDateStr(log: { date?: string | null; clock_in?: string | null }): string | null {
  if (log.clock_in) {
    return new Date(log.clock_in).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }
  return log.date ?? null;
}

type ResolvedEmployee = {
  id: string;
  tenant_id: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  hybrid_onsite_days?: string[] | null;
  work_days?: string[] | null;
};

async function resolveCurrentEmployee(userId: string): Promise<ResolvedEmployee | null> {
  const supabaseAdmin = getAdminClient();

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("*")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ResolvedEmployee>();

  if (!employee) {
    return null;
  }

  let tenantId = employee.tenant_id ?? null;
  if (!tenantId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle<{ tenant_id: string | null }>();
    tenantId = profile?.tenant_id ?? null;
  }

  return {
    ...employee,
    tenant_id: tenantId,
  };
}

export async function clockInAction(payload: ClockInPayload): Promise<ClockInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const supabaseAdmin = getAdminClient();
  const employee = await resolveCurrentEmployee(user.id);

  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR to link your account." };
  }

  const tenantId = employee.tenant_id;
  let validTenantId: string | null = null;
  if (tenantId) {
    const { data: tenantRow } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();
    validTenantId = tenantRow?.id ?? null;
  }

  // Active Session & Same-Day Duplicate Shift Guard
  const todayDateStr = getTodayLocalDateStr();
  const { data: recentLogs } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, date, clock_in, clock_out, status, zone_status, location_used, distance_meters")
    .eq("employee_id", employee.id)
    .order("clock_in", { ascending: false })
    .limit(10);

  const openLog = (recentLogs ?? []).find((l) => l.clock_out === null);
  if (openLog) {
    return {
      success: true,
      message: "Active shift resumed.",
      logId: openLog.id,
      status: openLog.status ?? "present",
      zone_status: openLog.zone_status ?? "onsite_verified",
      location_used: openLog.location_used ?? "office_branch",
      distanceMeters: openLog.distance_meters ?? null,
      clockIn: openLog.clock_in ?? undefined,
      resumed: true,
    };
  }

  const closedTodayLog = (recentLogs ?? []).find(
    (l) => l.clock_out !== null && getLogLocalDateStr(l) === todayDateStr
  );
  if (closedTodayLog && closedTodayLog.clock_out) {
    const elapsedSinceClockOut = Date.now() - new Date(closedTodayLog.clock_out).getTime();
    if (elapsedSinceClockOut < UNDO_CLOCK_OUT_WINDOW_MS) {
      return {
        success: false,
        error: "You clocked out less than 5 minutes ago. Use 'Reopen Shift (Undo Accidental Clock-Out)' to resume your shift.",
        canReopen: true,
        closedLogId: closedTodayLog.id,
      };
    }
    return {
      success: false,
      error: "Shift already completed for today. Submit an Attendance Correction Request if you clocked out by mistake.",
      shiftCompletedToday: true,
      closedLogId: closedTodayLog.id,
    };
  }

  // Auto-expire stale unreviewed overtime requests
  await supabaseAdmin
    .from("overtime_requests")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("work_date", todayDateStr);

  // Approved Leave Hard Lock (Highest Priority — overrides any OT approval)
  const { data: approvedLeaveToday } = await supabaseAdmin
    .from("leave_requests")
    .select("id, leave_type")
    .eq("employee_id", employee.id)
    .eq("status", "approved")
    .lte("start_date", todayDateStr)
    .gte("end_date", todayDateStr)
    .limit(1)
    .maybeSingle();

  if (approvedLeaveToday) {
    return {
      success: false,
      error: "Cannot clock in while on approved leave. HR must cancel or shorten your leave first.",
    };
  }

  const { latitude, longitude, accuracy_meters, flag_reason } = payload;

  const linkedJob = await getJobPostingPositionForProfile(user.id);
  const resolvedSetup = resolveContractWorkSetup({
    offerWorkSetup: linkedJob?.offerWorkSetup,
    jobWorkSetup: linkedJob?.jobWorkSetup,
    employeeWorkSetup: employee.work_mode,
  });

  const { data: latestSchedule } = await supabaseAdmin
    .from("schedules")
    .select("notes")
    .eq("employee_id", employee.id)
    .eq("is_published", true)
    .lte("week_start", todayDateStr)
    .order("week_start", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ notes: string | null }>();

  const todayDailyModel = resolveDailyWorkModel({
    contractWorkSetup: resolvedSetup,
    schedule: {
      notes: latestSchedule?.notes ?? null,
      work_days: Array.isArray(employee.work_days) ? employee.work_days : null,
    },
  });

  // Rest Day (todayDailyModel === "off") Overtime Gate
  let overtimeRequestId: string | null = null;
  let outsideApprovedWindow = false;
  if (todayDailyModel === "off") {
    const { data: approvedOt } = await supabaseAdmin
      .from("overtime_requests")
      .select("id, start_time, end_time")
      .eq("employee_id", employee.id)
      .eq("work_date", todayDateStr)
      .eq("status", "approved")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; start_time: string; end_time: string }>();

    if (!approvedOt) {
      return {
        success: false,
        error: "Scheduled Rest Day: Overtime requires prior HR approval before clocking in.",
      };
    }

    overtimeRequestId = approvedOt.id;
    const nowManilaTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    outsideApprovedWindow =
      nowManilaTime < approvedOt.start_time || nowManilaTime > approvedOt.end_time;
  }

  const geofence = await resolveEmployeeGeofence(supabaseAdmin, {
    id: employee.id,
    tenant_id: tenantId,
    work_mode: resolvedSetup,
    work_location_id: employee.work_location_id ?? linkedJob?.workLocationId,
    hybrid_onsite_days: employee.hybrid_onsite_days,
    work_days: employee.work_days,
    todayDailyModel,
  });

  if (!geofence.configured) {
    return {
      success: false,
      error: geofence.error,
    };
  }

  const isRemoteMode = geofence.mode === "remote_residence";
  const geofenceRadius = geofence.radiusMeters;
  const locationUsed: "office_branch" | "remote_residence" = geofence.mode;

  // Server-Side Haversine Distance Calculation & Zone Evaluation
  const dist = calculateHaversineDistance(
    latitude,
    longitude,
    geofence.latitude,
    geofence.longitude
  );
  const distanceMeters = dist;

  if (dist > geofenceRadius) {
    return {
      success: false,
      error: `Outside geofence radius (${Math.round(dist)}m away; max ${geofenceRadius}m allowed).`,
      distanceMeters: Math.round(dist),
      radiusMeters: geofenceRadius,
    };
  }

  const zoneStatus: "onsite_verified" | "remote_verified" = isRemoteMode
    ? "remote_verified"
    : "onsite_verified";

  // Persistence: Insert into attendance_logs
  const { data: newLog, error: insertError } = await supabaseAdmin
    .from("attendance_logs")
    .insert({
      employee_id: employee.id,
      tenant_id: validTenantId,
      date: todayDateStr,
      clock_in: new Date().toISOString(),
      latitude,
      longitude,
      accuracy_meters,
      distance_meters: Math.round(distanceMeters),
      zone_status: zoneStatus,
      location_used: locationUsed,
      flag_reason: flag_reason || null,
      status: zoneStatus,
      verification_type: locationUsed,
      overtime_request_id: overtimeRequestId,
      outside_approved_window: outsideApprovedWindow,
      ...(overtimeRequestId ? { is_late: false, late_minutes: 0 } : {}),
    })
    .select("id")
    .single();

  if (insertError || !newLog) {
    return { success: false, error: insertError?.message || "Failed to log attendance." };
  }

  revalidatePath("/employee/schedule");
  return {
    success: true,
    message: "Clocked in successfully!",
    logId: newLog.id,
    status: zoneStatus,
    zone_status: zoneStatus,
    location_used: locationUsed,
    distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
  };
}

export async function clockOutAction(logId: string): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR to link your account." };
  }

  const clockOutTime = new Date();

  // Fetch the attendance log record
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, clock_in")
    .eq("id", logId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (!log) {
    return { success: false, error: "Attendance log not found." };
  }

  const clockInTime = new Date(log.clock_in);
  const totalHours = Math.max(0, (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60));

  const { error } = await supabase
    .from("attendance_logs")
    .update({
      clock_out: clockOutTime.toISOString(),
      total_hours: Number(totalHours.toFixed(2)),
      status: "completed",
      active_break_type: null,
      break_status: "clocked_out",
    })
    .eq("id", logId)
    .eq("employee_id", employee.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return { success: true, message: "Clocked out successfully!" };
}

type BreakLogEntry = {
  type: "lunch" | "short_break";
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  overbreak_minutes: number;
};

type BreakLogState = {
  id: string;
  lunch_start: string | null;
  lunch_end: string | null;
  total_lunch_minutes: number | null;
  break_start: string | null;
  break_end: string | null;
  total_break_minutes: number | null;
  short_breaks_used: number | null;
  overbreak_minutes: number | null;
  active_break_type: string | null;
  break_status: string | null;
  break_log: BreakLogEntry[] | null;
};

export type BreakToggleResult =
  | {
      success: true;
      active_break_type: "lunch" | "short_break" | null;
      break_status: string;
      lunch_start: string | null;
      lunch_end: string | null;
      break_start: string | null;
      total_lunch_minutes: number;
      total_break_minutes: number;
      short_breaks_used: number;
      overbreak_minutes: number;
    }
  | { success: false; error: string };

export async function toggleLunchAction(
  logId: string,
  startLunch: boolean
): Promise<BreakToggleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR to link your account." };
  }

  const { data: log, error: fetchErr } = await supabase
    .from("attendance_logs")
    .select(
      "id, lunch_start, lunch_end, total_lunch_minutes, break_start, break_end, total_break_minutes, short_breaks_used, overbreak_minutes, active_break_type, break_status, break_log"
    )
    .eq("id", logId)
    .eq("employee_id", employee.id)
    .maybeSingle<BreakLogState>();

  if (fetchErr || !log) {
    return { success: false, error: fetchErr?.message || "Attendance log not found." };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const existingLog = Array.isArray(log.break_log) ? log.break_log : [];

  if (startLunch) {
    if (log.active_break_type === "short_break") {
      return { success: false, error: "Please end your 15-minute break before starting lunch." };
    }
    if (log.active_break_type === "lunch") {
      return { success: false, error: "Lunch break is already active." };
    }

    const { error } = await supabase
      .from("attendance_logs")
      .update({
        lunch_start: nowIso,
        lunch_end: null,
        active_break_type: "lunch",
        break_status: "on_lunch",
        updated_at: nowIso,
      })
      .eq("id", logId)
      .eq("employee_id", employee.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/employee/schedule");
    revalidatePath("/hr/schedules");
    revalidatePath("/hr/attendance");
    return {
      success: true,
      active_break_type: "lunch",
      break_status: "on_lunch",
      lunch_start: log.lunch_start ?? nowIso,
      lunch_end: null,
      break_start: log.break_start ?? null,
      total_lunch_minutes: log.total_lunch_minutes ?? 0,
      total_break_minutes: log.total_break_minutes ?? 0,
      short_breaks_used: log.short_breaks_used ?? 0,
      overbreak_minutes: log.overbreak_minutes ?? 0,
    };
  }

  // End lunch
  const parsedLunchStart = log.lunch_start ? new Date(log.lunch_start) : null;
  const startedAt =
    parsedLunchStart &&
    !Number.isNaN(parsedLunchStart.getTime()) &&
    parsedLunchStart.getTime() > 86_400_000
      ? parsedLunchStart
      : now;
  const elapsedMinutes = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60000));
  const nextTotalLunch = (log.total_lunch_minutes ?? 0) + elapsedMinutes;
  const addedOverbreak = Math.max(0, nextTotalLunch - 60) - Math.max(0, (log.total_lunch_minutes ?? 0) - 60);
  const nextOverbreak = (log.overbreak_minutes ?? 0) + Math.max(0, addedOverbreak);
  const nextBreakLog: BreakLogEntry[] = [
    ...existingLog,
    {
      type: "lunch",
      started_at: startedAt.toISOString(),
      ended_at: nowIso,
      duration_minutes: elapsedMinutes,
      overbreak_minutes: Math.max(0, addedOverbreak),
    },
  ];

  const { error } = await supabase
    .from("attendance_logs")
    .update({
      lunch_end: nowIso,
      total_lunch_minutes: nextTotalLunch,
      overbreak_minutes: nextOverbreak,
      active_break_type: null,
      break_status: "active",
      break_log: nextBreakLog,
      updated_at: nowIso,
    })
    .eq("id", logId)
    .eq("employee_id", employee.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/schedules");
  revalidatePath("/hr/attendance");
  return {
    success: true,
    active_break_type: null,
    break_status: "active",
    lunch_start: log.lunch_start,
    lunch_end: nowIso,
    break_start: log.break_start ?? null,
    total_lunch_minutes: nextTotalLunch,
    total_break_minutes: log.total_break_minutes ?? 0,
    short_breaks_used: log.short_breaks_used ?? 0,
    overbreak_minutes: nextOverbreak,
  };
}

export async function toggleShortBreakAction(
  logId: string,
  startBreak: boolean
): Promise<BreakToggleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR to link your account." };
  }

  const { data: log, error: fetchErr } = await supabase
    .from("attendance_logs")
    .select(
      "id, lunch_start, lunch_end, total_lunch_minutes, break_start, break_end, total_break_minutes, short_breaks_used, overbreak_minutes, active_break_type, break_status, break_log"
    )
    .eq("id", logId)
    .eq("employee_id", employee.id)
    .maybeSingle<BreakLogState>();

  if (fetchErr || !log) {
    return { success: false, error: fetchErr?.message || "Attendance log not found." };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const existingLog = Array.isArray(log.break_log) ? log.break_log : [];
  const usedCount = log.short_breaks_used ?? 0;

  if (startBreak) {
    if (log.active_break_type === "lunch") {
      return { success: false, error: "Please end your lunch break before starting a 15-minute break." };
    }
    if (log.active_break_type === "short_break") {
      return { success: false, error: "15-minute break is already active." };
    }
    if (usedCount >= 2) {
      return { success: false, error: "You have already used both of your 15-minute paid breaks for this shift." };
    }

    const nextUsed = usedCount + 1;
    const { error } = await supabase
      .from("attendance_logs")
      .update({
        break_start: nowIso,
        break_end: null,
        short_breaks_used: nextUsed,
        active_break_type: "short_break",
        break_status: "on_break",
        updated_at: nowIso,
      })
      .eq("id", logId)
      .eq("employee_id", employee.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/employee/schedule");
    revalidatePath("/hr/schedules");
    revalidatePath("/hr/attendance");
    return {
      success: true,
      active_break_type: "short_break",
      break_status: "on_break",
      lunch_start: log.lunch_start ?? null,
      lunch_end: log.lunch_end ?? null,
      break_start: nowIso,
      total_lunch_minutes: log.total_lunch_minutes ?? 0,
      total_break_minutes: log.total_break_minutes ?? 0,
      short_breaks_used: nextUsed,
      overbreak_minutes: log.overbreak_minutes ?? 0,
    };
  }

  // End short break
  const parsedBreakStart = log.break_start ? new Date(log.break_start) : null;
  const startedAt =
    parsedBreakStart &&
    !Number.isNaN(parsedBreakStart.getTime()) &&
    parsedBreakStart.getTime() > 86_400_000
      ? parsedBreakStart
      : now;
  const elapsedMinutes = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60000));
  const addedOverbreak = Math.max(0, elapsedMinutes - 15);
  const nextTotalBreak = (log.total_break_minutes ?? 0) + elapsedMinutes;
  const nextOverbreak = (log.overbreak_minutes ?? 0) + addedOverbreak;
  const nextBreakLog: BreakLogEntry[] = [
    ...existingLog,
    {
      type: "short_break",
      started_at: startedAt.toISOString(),
      ended_at: nowIso,
      duration_minutes: elapsedMinutes,
      overbreak_minutes: addedOverbreak,
    },
  ];

  const { error } = await supabase
    .from("attendance_logs")
    .update({
      break_end: nowIso,
      total_break_minutes: nextTotalBreak,
      overbreak_minutes: nextOverbreak,
      active_break_type: null,
      break_status: "active",
      break_log: nextBreakLog,
      updated_at: nowIso,
    })
    .eq("id", logId)
    .eq("employee_id", employee.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/schedules");
  revalidatePath("/hr/attendance");
  return {
    success: true,
    active_break_type: null,
    break_status: "active",
    lunch_start: log.lunch_start ?? null,
    lunch_end: log.lunch_end ?? null,
    break_start: nowIso,
    total_lunch_minutes: log.total_lunch_minutes ?? 0,
    total_break_minutes: nextTotalBreak,
    short_breaks_used: usedCount,
    overbreak_minutes: nextOverbreak,
  };
}

export type LiveLocationUpdatePayload = {
  attendanceLogId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type LiveLocationUpdateResult =
  | {
      success: true;
      distanceMeters: number;
      isOutside: boolean;
      allowedRadius: number;
      zoneStatus: "onsite_verified" | "remote_verified" | "outside_zone";
    }
  | { success: false; error: string };

export async function updateLiveAttendanceLocationAction(
  payload: LiveLocationUpdatePayload
): Promise<LiveLocationUpdateResult> {
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

  const supabaseAdmin = getAdminClient();
  const { data: openLog } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, clock_out")
    .eq("id", payload.attendanceLogId)
    .eq("employee_id", employee.id)
    .is("clock_out", null)
    .maybeSingle<{ id: string; clock_out: string | null }>();

  if (!openLog) {
    return { success: false, error: "No open attendance log found." };
  }

  const linkedJob = await getJobPostingPositionForProfile(user.id);
  const resolvedSetup = resolveContractWorkSetup({
    offerWorkSetup: linkedJob?.offerWorkSetup,
    jobWorkSetup: linkedJob?.jobWorkSetup,
    employeeWorkSetup: employee.work_mode,
  });

  const geofence = await resolveEmployeeGeofence(supabaseAdmin, {
    id: employee.id,
    tenant_id: employee.tenant_id,
    work_mode: resolvedSetup,
    work_location_id: employee.work_location_id ?? linkedJob?.workLocationId,
    hybrid_onsite_days: employee.hybrid_onsite_days,
    work_days: employee.work_days,
  });

  if (!geofence.configured) {
    return { success: false, error: geofence.error };
  }

  const allowedRadius = geofence.radiusMeters || 100;
  const distanceMeters = Math.round(
    calculateHaversineDistance(
      payload.latitude,
      payload.longitude,
      geofence.latitude,
      geofence.longitude
    )
  );
  const isOutside = distanceMeters > allowedRadius;
  const zoneStatus: "onsite_verified" | "remote_verified" | "outside_zone" = isOutside
    ? "outside_zone"
    : geofence.mode === "remote_residence"
      ? "remote_verified"
      : "onsite_verified";

  const { error: updateErr } = await supabaseAdmin
    .from("attendance_logs")
    .update({
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy_meters: payload.accuracyMeters,
      distance_meters: distanceMeters,
      zone_status: zoneStatus,
      flag_reason: isOutside
        ? `Outside working zone (${distanceMeters}m > ${allowedRadius}m limit)`
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", openLog.id)
    .eq("employee_id", employee.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath("/hr/attendance");
  return {
    success: true,
    distanceMeters,
    isOutside,
    allowedRadius,
    zoneStatus,
  };
}

export type ReopenShiftResult =
  | {
      success: true;
      message: string;
      log: {
        id: string;
        clock_in: string;
        clock_out: string | null;
        status: string;
        verification_type: string | null;
        distance_meters: number | null;
        zone_status: string | null;
        break_status: string | null;
        active_break_type: string | null;
        lunch_start: string | null;
        lunch_end: string | null;
        total_lunch_minutes: number | null;
        break_start: string | null;
        total_break_minutes: number | null;
        short_breaks_used: number | null;
        overbreak_minutes: number | null;
        break_log: BreakLogEntry[] | null;
      };
    }
  | { success: false; error: string };

export async function reopenShiftAction(logId: string): Promise<ReopenShiftResult> {
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

  const supabaseAdmin = getAdminClient();
  const { data: log } = await supabaseAdmin
    .from("attendance_logs")
    .select(
      "id, clock_in, clock_out, status, verification_type, distance_meters, zone_status, break_status, active_break_type, lunch_start, lunch_end, total_lunch_minutes, break_start, total_break_minutes, short_breaks_used, overbreak_minutes, break_log"
    )
    .eq("id", logId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (!log) {
    return { success: false, error: "Attendance log not found." };
  }

  if (!log.clock_out) {
    return {
      success: true,
      message: "Shift is already active.",
      log: log as ReopenShiftResult & { success: true } extends { log: infer L } ? L : never,
    };
  }

  const elapsedSinceClockOut = Date.now() - new Date(log.clock_out).getTime();
  if (elapsedSinceClockOut >= UNDO_CLOCK_OUT_WINDOW_MS) {
    return {
      success: false,
      error: "The 5-minute undo window has expired. Please submit an Attendance Correction Request.",
    };
  }

  const restoredStatus = log.zone_status || "onsite_verified";
  const { data: updatedLog, error: updateErr } = await supabaseAdmin
    .from("attendance_logs")
    .update({
      clock_out: null,
      total_hours: null,
      status: restoredStatus,
      break_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", logId)
    .eq("employee_id", employee.id)
    .select(
      "id, clock_in, clock_out, status, verification_type, distance_meters, zone_status, break_status, active_break_type, lunch_start, lunch_end, total_lunch_minutes, break_start, total_break_minutes, short_breaks_used, overbreak_minutes, break_log"
    )
    .single();

  if (updateErr || !updatedLog) {
    return { success: false, error: updateErr?.message || "Failed to reopen shift." };
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return {
    success: true,
    message: "Shift reopened. Your original clock-in time was preserved.",
    log: updatedLog as {
      id: string;
      clock_in: string;
      clock_out: string | null;
      status: string;
      verification_type: string | null;
      distance_meters: number | null;
      zone_status: string | null;
      break_status: string | null;
      active_break_type: string | null;
      lunch_start: string | null;
      lunch_end: string | null;
      total_lunch_minutes: number | null;
      break_start: string | null;
      total_break_minutes: number | null;
      short_breaks_used: number | null;
      overbreak_minutes: number | null;
      break_log: BreakLogEntry[] | null;
    },
  };
}

export type SubmitAttendanceCorrectionPayload = {
  attendanceLogId?: string | null;
  targetDate: string;
  correctionType: string;
  requestedClockIn: string;
  requestedClockOut?: string | null;
  reason: string;
};

export type SubmitAttendanceCorrectionResult =
  | { success: true; message: string; requestId: string }
  | { success: false; error: string };

export async function submitAttendanceCorrectionAction(
  payload: SubmitAttendanceCorrectionPayload
): Promise<SubmitAttendanceCorrectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR." };
  }

  const targetDate = payload.targetDate?.trim();
  const correctionType = payload.correctionType?.trim();
  const reason = payload.reason?.trim();

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { success: false, error: "Please select a valid target date." };
  }
  if (!correctionType) {
    return { success: false, error: "Please select a correction type." };
  }
  if (!reason || reason.length < 5) {
    return { success: false, error: "Please provide a brief reason (at least 5 characters)." };
  }

  const reqInDate = new Date(payload.requestedClockIn);
  if (Number.isNaN(reqInDate.getTime())) {
    return { success: false, error: "Invalid requested clock-in timestamp." };
  }

  let reqOutIso: string | null = null;
  if (payload.requestedClockOut) {
    const reqOutDate = new Date(payload.requestedClockOut);
    if (Number.isNaN(reqOutDate.getTime())) {
      return { success: false, error: "Invalid requested clock-out timestamp." };
    }
    if (reqOutDate.getTime() <= reqInDate.getTime()) {
      return { success: false, error: "Requested clock-out must be after requested clock-in." };
    }
    reqOutIso = reqOutDate.toISOString();
  }

  const supabaseAdmin = getAdminClient();

  // Prevent duplicate pending requests for the same date or log
  const { data: existingPending } = await supabaseAdmin
    .from("attendance_correction_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("status", "pending")
    .eq("target_date", targetDate)
    .limit(1)
    .maybeSingle();

  if (existingPending) {
    return {
      success: false,
      error: "You already have a pending correction request for this date.",
    };
  }

  if (payload.attendanceLogId) {
    const { data: existingByLog } = await supabaseAdmin
      .from("attendance_correction_requests")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("status", "pending")
      .eq("attendance_log_id", payload.attendanceLogId)
      .limit(1)
      .maybeSingle();

    if (existingByLog) {
      return {
        success: false,
        error: "A pending correction request already exists for this attendance log.",
      };
    }
  }

  let originalClockIn: string | null = null;
  let originalClockOut: string | null = null;
  if (payload.attendanceLogId) {
    const { data: origLog } = await supabaseAdmin
      .from("attendance_logs")
      .select("clock_in, clock_out")
      .eq("id", payload.attendanceLogId)
      .eq("employee_id", employee.id)
      .maybeSingle<{ clock_in: string | null; clock_out: string | null }>();
    if (origLog) {
      originalClockIn = origLog.clock_in;
      originalClockOut = origLog.clock_out;
    }
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("attendance_correction_requests")
    .insert({
      tenant_id: employee.tenant_id,
      employee_id: employee.id,
      attendance_log_id: payload.attendanceLogId || null,
      target_date: targetDate,
      correction_type: correctionType,
      original_clock_in: originalClockIn,
      original_clock_out: originalClockOut,
      requested_clock_in: reqInDate.toISOString(),
      requested_clock_out: reqOutIso,
      reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { success: false, error: insertErr?.message || "Failed to submit correction request." };
  }

  // Notify HR/admin profiles
  const { data: empProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>();

  const employeeName =
    [empProfile?.first_name, empProfile?.last_name].filter(Boolean).join(" ").trim() || "An employee";

  let hrQuery = supabaseAdmin
    .from("profiles")
    .select("id, tenant_id")
    .in("role", ["hr_manager", "hr", "admin"]);

  if (employee.tenant_id) {
    hrQuery = hrQuery.or(`tenant_id.eq.${employee.tenant_id},tenant_id.is.null`);
  }

  const { data: hrProfiles } = await hrQuery;
  if (hrProfiles && hrProfiles.length > 0) {
    const notificationRows = hrProfiles.map((hr) => ({
      recipient_id: hr.id,
      sender_id: user.id,
      type: "general" as const,
      title: "Attendance Correction Request",
      body: `${employeeName} submitted a ${correctionType} correction for ${targetDate}.`,
      action_url: "/hr/attendance",
    }));
    await supabaseAdmin.from("notifications").insert(notificationRows);
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return {
    success: true,
    message: "Attendance correction request submitted for HR review.",
    requestId: inserted.id,
  };
}

export type SubmitOvertimeRequestPayload = {
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export type OvertimeActionResult =
  | { success: true; message: string; requestId?: string }
  | { success: false; error: string };

export async function submitOvertimeRequestAction(
  payload: SubmitOvertimeRequestPayload
): Promise<OvertimeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const employee = await resolveCurrentEmployee(user.id);
  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR." };
  }

  const todayManila = getTodayLocalDateStr();
  const workDate = payload.workDate?.trim();
  const startTime = payload.startTime?.trim();
  const endTime = payload.endTime?.trim();
  const reason = payload.reason?.trim();

  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { success: false, error: "Please select a valid work date." };
  }
  if (workDate < todayManila) {
    return { success: false, error: "Overtime requests cannot be submitted for past dates." };
  }
  if (!startTime || !endTime || endTime <= startTime) {
    return { success: false, error: "End time must be after start time." };
  }
  if (!reason || reason.length < 5) {
    return { success: false, error: "Please provide a reason (at least 5 characters)." };
  }

  const supabaseAdmin = getAdminClient();

  const { data: existing } = await supabaseAdmin
    .from("overtime_requests")
    .select("id, status")
    .eq("employee_id", employee.id)
    .eq("work_date", workDate)
    .in("status", ["pending", "approved"])
    .is("used_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `You already have a ${existing.status} overtime request for ${workDate}.`,
    };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("overtime_requests")
    .insert({
      tenant_id: employee.tenant_id,
      employee_id: employee.id,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      reason,
      status: "pending",
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { success: false, error: insertErr?.message || "Failed to submit overtime request." };
  }

  const { data: empProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>();

  const employeeName =
    [empProfile?.first_name, empProfile?.last_name].filter(Boolean).join(" ").trim() || "An employee";

  let hrQuery = supabaseAdmin
    .from("profiles")
    .select("id, tenant_id")
    .in("role", ["hr_manager", "hr", "admin"]);

  if (employee.tenant_id) {
    hrQuery = hrQuery.or(`tenant_id.eq.${employee.tenant_id},tenant_id.is.null`);
  }

  const { data: hrProfiles } = await hrQuery;
  if (hrProfiles && hrProfiles.length > 0) {
    await supabaseAdmin.from("notifications").insert(
      hrProfiles.map((hr) => ({
        recipient_id: hr.id,
        sender_id: user.id,
        type: "general" as const,
        title: "Overtime Request",
        body: `${employeeName} requested rest-day overtime on ${workDate} (${startTime}–${endTime}).`,
        action_url: "/hr/attendance",
      }))
    );
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return {
    success: true,
    message: "Overtime request submitted for HR approval.",
    requestId: inserted.id,
  };
}

export async function cancelOvertimeRequestAction(
  requestId: string
): Promise<OvertimeActionResult> {
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

  const supabaseAdmin = getAdminClient();
  const { data: reqRow } = await supabaseAdmin
    .from("overtime_requests")
    .select("id, status, used_at")
    .eq("id", requestId)
    .eq("employee_id", employee.id)
    .maybeSingle<{ id: string; status: string; used_at: string | null }>();

  if (!reqRow) {
    return { success: false, error: "Overtime request not found." };
  }

  const canCancel =
    reqRow.status === "pending" || (reqRow.status === "approved" && reqRow.used_at === null);
  if (!canCancel) {
    return { success: false, error: "This overtime request can no longer be cancelled." };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("overtime_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("employee_id", employee.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath("/employee/schedule");
  revalidatePath("/hr/attendance");
  return { success: true, message: "Overtime request cancelled." };
}

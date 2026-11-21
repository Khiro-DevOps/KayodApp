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
    }
  | { success: false; error: string; distanceMeters?: number; radiusMeters?: number };

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

  // Active Session Guard: Prevent multiple open clock-in sessions for the same employee
  const { data: activeLog } = await supabaseAdmin
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", employee.id)
    .is("clock_out", null)
    .maybeSingle();

  if (activeLog) {
    return { success: false, error: "You are already clocked in." };
  }

  const { latitude, longitude, accuracy_meters, flag_reason } = payload;

  const linkedJob = await getJobPostingPositionForProfile(user.id);
  const resolvedSetup = resolveContractWorkSetup({
    offerWorkSetup: linkedJob?.offerWorkSetup,
    jobWorkSetup: linkedJob?.jobWorkSetup,
    employeeWorkSetup: employee.work_mode,
  });

  const todayDailyModel = resolveDailyWorkModel({
    contractWorkSetup: resolvedSetup,
    schedule: {
      work_days: Array.isArray(employee.work_days) ? employee.work_days : null,
    },
  });

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

"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { calculateHaversineDistance } from "@/lib/haversine";
import { resolveEmployeeGeofence } from "@/lib/geofence-resolver";

export type ClockInPayload = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  flag_reason?: string;
};

export type ClockInResult =
  | { success: true; message: string; logId: string; status: string; zone_status: string; location_used: string }
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
  const { data: activeLog } = await supabase
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", employee.id)
    .is("clock_out", null)
    .maybeSingle();

  if (activeLog) {
    return { success: false, error: "You are already clocked in." };
  }

  const { latitude, longitude, accuracy_meters, flag_reason } = payload;

  const geofence = await resolveEmployeeGeofence(supabaseAdmin, {
    id: employee.id,
    tenant_id: tenantId,
    work_mode: employee.work_mode,
    work_location_id: employee.work_location_id,
    hybrid_onsite_days: employee.hybrid_onsite_days,
    work_days: employee.work_days,
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
  const { data: newLog, error: insertError } = await supabase
    .from("attendance_logs")
    .insert({
      employee_id: employee.id,
      tenant_id: validTenantId,
      clock_in: new Date().toISOString(),
      latitude,
      longitude,
      accuracy_meters,
      distance_meters: distanceMeters !== null ? Math.round(distanceMeters) : null,
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
    })
    .eq("id", logId)
    .eq("employee_id", employee.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  return { success: true, message: "Clocked out successfully!" };
}

export async function toggleBreakAction(logId: string, isBreakActive: boolean) {
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

  const { error } = await supabase
    .from("attendance_logs")
    .update({
      break_status: isBreakActive ? "on_break" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", logId)
    .eq("employee_id", employee.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  return { success: true, isBreakActive };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { calculateHaversineDistance } from "@/lib/haversine";

export type ClockInPayload = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  flag_reason?: string;
};

export type ClockInResult =
  | { success: true; message: string; logId: string; status: string; zone_status: string; location_used: string }
  | { success: false; error: string; distanceMeters?: number; radiusMeters?: number };

export async function clockInAction(payload: ClockInPayload): Promise<ClockInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // Use admin client for employee lookup to bypass RLS restrictions
  const supabaseAdmin = getAdminClient();

  // 1. Authenticate user & fetch employee record with profiles (tenant_id)
  let { data: employee } = await supabaseAdmin
    .from("employees")
    .select("id, work_model, work_location_id, hybrid_onsite_days, work_days, profiles ( tenant_id )")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const { data: empByEmail } = await supabaseAdmin
      .from("employees")
      .select("id, work_model, work_location_id, hybrid_onsite_days, work_days, profiles ( tenant_id )")
      .eq("email", user.email)
      .maybeSingle();
    employee = empByEmail;
  }

  if (!employee) {
    return { success: false, error: "Employee profile not found. Please contact HR to link your account." };
  }

  const tenantId = (employee.profiles as any)?.tenant_id || null;

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

  const empRecord = employee as {
    id: string;
    work_model?: string | null;
    work_location_id?: string | null;
    hybrid_onsite_days?: string[] | null;
    work_days?: string[] | null;
  };
  const workMode = empRecord.work_model || "onsite";
  const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const hybridOnsiteDays: string[] = Array.isArray(empRecord.hybrid_onsite_days)
    ? empRecord.hybrid_onsite_days
    : Array.isArray(empRecord.work_days)
    ? empRecord.work_days
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const isHybridRemoteDay =
    workMode === "hybrid" &&
    !hybridOnsiteDays.some((d) => d.trim().toLowerCase() === todayDayName);
  const isRemoteMode = workMode === "remote" || workMode === "wfh" || isHybridRemoteDay;

  const { latitude, longitude, accuracy_meters, flag_reason } = payload;

  let targetLat: number | null = null;
  let targetLng: number | null = null;
  let geofenceRadius = 200;
  let locationUsed: "office_branch" | "remote_residence" | "unconfigured" = "unconfigured";

  // Target Coordinates Resolution
  if (isRemoteMode) {
    // Fetch employee_remote_residences record
    const { data: remoteRes } = await supabaseAdmin
      .from("employee_remote_residences")
      .select("latitude, longitude, geofence_radius_meters")
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (remoteRes && remoteRes.latitude != null && remoteRes.longitude != null) {
      targetLat = Number(remoteRes.latitude);
      targetLng = Number(remoteRes.longitude);
      geofenceRadius = Number(remoteRes.geofence_radius_meters) || 200;
      locationUsed = "remote_residence";
    }
  } else {
    // Onsite or Hybrid onsite day: Fetch assigned work_locations record (fallback to office_branches)
    if (employee.work_location_id) {
      const { data: workLoc } = await supabaseAdmin
        .from("work_locations")
        .select("latitude, longitude, radius_meters")
        .eq("id", employee.work_location_id)
        .maybeSingle();

      if (workLoc && workLoc.latitude != null && workLoc.longitude != null) {
        targetLat = Number(workLoc.latitude);
        targetLng = Number(workLoc.longitude);
        geofenceRadius = Number(workLoc.radius_meters) || 200;
        locationUsed = "office_branch";
      } else {
        const { data: branch } = await supabaseAdmin
          .from("office_branches")
          .select("latitude, longitude, radius_meters")
          .eq("id", employee.work_location_id)
          .maybeSingle();

        if (branch && branch.latitude != null && branch.longitude != null) {
          targetLat = Number(branch.latitude);
          targetLng = Number(branch.longitude);
          geofenceRadius = Number(branch.radius_meters) || 200;
          locationUsed = "office_branch";
        }
      }
    }

    // Fallback: If no assigned location found, fetch default work_locations or first office_branches in tenant
    if (targetLat === null) {
      const { data: defaultWorkLoc } = await supabaseAdmin
        .from("work_locations")
        .select("latitude, longitude, radius_meters")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();

      if (defaultWorkLoc && defaultWorkLoc.latitude != null && defaultWorkLoc.longitude != null) {
        targetLat = Number(defaultWorkLoc.latitude);
        targetLng = Number(defaultWorkLoc.longitude);
        geofenceRadius = Number(defaultWorkLoc.radius_meters) || 200;
        locationUsed = "office_branch";
      } else {
        let query = supabaseAdmin.from("office_branches").select("latitude, longitude, radius_meters");
        if (tenantId) query = query.eq("tenant_id", tenantId);
        const { data: fallbackBranch } = await query.limit(1).maybeSingle();

        if (fallbackBranch && fallbackBranch.latitude != null && fallbackBranch.longitude != null) {
          targetLat = Number(fallbackBranch.latitude);
          targetLng = Number(fallbackBranch.longitude);
          geofenceRadius = Number(fallbackBranch.radius_meters) || 200;
          locationUsed = "office_branch";
        }
      }
    }
  }

  // Server-Side Haversine Distance Calculation & Zone Evaluation
  let distanceMeters: number | null = null;
  let zoneStatus: "onsite_verified" | "remote_verified" | "outside_zone" | "location_unverified" = "location_unverified";

  if (targetLat !== null && targetLng !== null && !isNaN(targetLat) && !isNaN(targetLng)) {
    const dist = calculateHaversineDistance(latitude, longitude, targetLat, targetLng);
    distanceMeters = dist;

    if (dist <= geofenceRadius) {
      zoneStatus = isRemoteMode ? "remote_verified" : "onsite_verified";
    } else {
      return {
        success: false,
        error: `Outside geofence radius (${Math.round(dist)}m away; max ${geofenceRadius}m allowed).`,
        distanceMeters: Math.round(dist),
        radiusMeters: geofenceRadius,
      };
    }
  } else {
    zoneStatus = "location_unverified";
    locationUsed = "unconfigured";
  }

  // Persistence: Insert into attendance_logs
  const { data: newLog, error: insertError } = await supabase
    .from("attendance_logs")
    .insert({
      employee_id: employee.id,
      tenant_id: tenantId,
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

  const clockOutTime = new Date();

  // Fetch the attendance log record
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, clock_in")
    .eq("id", logId)
    .single();

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
    .eq("id", logId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  return { success: true, message: "Clocked out successfully!" };
}

export async function toggleBreakAction(logId: string, isBreakActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_logs")
    .update({
      break_status: isBreakActive ? "on_break" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", logId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/employee/schedule");
  return { success: true, isBreakActive };
}

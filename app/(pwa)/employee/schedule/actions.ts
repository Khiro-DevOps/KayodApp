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
  | { success: false; error: string };

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
    .select("id, work_model, work_location_id, profiles ( tenant_id )")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const { data: empByEmail } = await supabaseAdmin
      .from("employees")
      .select("id, work_model, work_location_id, profiles ( tenant_id )")
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

  const workMode = (employee.work_model as string) || "onsite";
  const { latitude, longitude, accuracy_meters, flag_reason } = payload;

  let targetLat: number | null = null;
  let targetLng: number | null = null;
  let geofenceRadius = 200;
  let locationUsed: "office_branch" | "remote_residence" | "unconfigured" = "unconfigured";

  // Target Coordinates Resolution
  if (workMode === "remote" || workMode === "wfh") {
    // Fetch employee_remote_residences record
    const { data: remoteRes } = await supabase
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
    // Onsite or Hybrid work mode: Fetch assigned office_branches record
    if (employee.work_location_id) {
      const { data: branch } = await supabase
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

    // Fallback: If no assigned branch found, fetch first branch in tenant or default branch
    if (targetLat === null) {
      let query = supabase.from("office_branches").select("latitude, longitude, radius_meters");
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

  // Server-Side Haversine Distance Calculation & Zone Evaluation
  let distanceMeters: number | null = null;
  let zoneStatus: "onsite_verified" | "remote_verified" | "outside_zone" | "location_unverified" = "location_unverified";

  if (targetLat !== null && targetLng !== null && !isNaN(targetLat) && !isNaN(targetLng)) {
    const dist = calculateHaversineDistance(latitude, longitude, targetLat, targetLng);
    distanceMeters = dist;

    if (dist <= geofenceRadius) {
      zoneStatus = (workMode === "remote" || workMode === "wfh") ? "remote_verified" : "onsite_verified";
    } else {
      zoneStatus = "outside_zone";
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
      flag_reason: zoneStatus === "outside_zone" ? (flag_reason || "Outside designated zone") : (flag_reason || null),
      status: zoneStatus,
      verification_type: locationUsed,
      notes: zoneStatus === "outside_zone" ? `Outside zone flag: ${flag_reason || "None"}` : undefined,
    })
    .select("id")
    .single();

  if (insertError || !newLog) {
    return { success: false, error: insertError?.message || "Failed to log attendance." };
  }

  revalidatePath("/employee/schedule");
  return {
    success: true,
    message: zoneStatus === "outside_zone" ? "Clocked in with flag (outside zone)." : "Clocked in successfully!",
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

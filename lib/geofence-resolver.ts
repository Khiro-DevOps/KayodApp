import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPhtDayInfo,
  normalizeDaysToFull,
  parseHybridScheduleNotes,
} from "@/lib/hybrid-schedule";

export type ResolvedGeofence =
  | {
      configured: true;
      mode: "remote_residence" | "office_branch";
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      radiusMeters: number;
      isEmergencyOverride?: boolean;
      overrideReason?: string | null;
      effectiveWorkMode?: "onsite" | "wfh" | "off";
    }
  | {
      configured: false;
      mode: "remote_residence" | "office_branch";
      error: string;
      name: string;
      address: string | null;
      radiusMeters: number;
      isEmergencyOverride?: boolean;
      overrideReason?: string | null;
      effectiveWorkMode?: "onsite" | "wfh" | "off";
    };

export interface GeofenceEmployeeInput {
  id: string;
  tenant_id?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  fallback_work_location_id?: string | null;
  hybrid_onsite_days?: string[] | null;
  work_days?: string[] | null;
  daily_work_modes?: Record<string, string | null | undefined> | null;
  onsite_days?: string[] | null;
  wfh_days?: string[] | null;
  todayDailyModel?: "onsite" | "wfh" | "off";
  effectiveDate?: string;
}

type BranchRow = {
  name?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  radius_meters?: number | null;
};

function hasValidCoords(row: BranchRow | null | undefined): row is BranchRow & {
  latitude: number | string;
  longitude: number | string;
} {
  return Boolean(
    row &&
      row.latitude != null &&
      row.longitude != null &&
      !Number.isNaN(Number(row.latitude)) &&
      !Number.isNaN(Number(row.longitude))
  );
}

async function fetchOfficeBranchById(
  supabase: SupabaseClient,
  locationId: string
): Promise<BranchRow | null> {
  const { data: officeBranch } = await supabase
    .from("office_branches")
    .select("name, address, latitude, longitude, radius_meters")
    .eq("id", locationId)
    .maybeSingle<BranchRow>();

  return officeBranch ?? null;
}

async function fetchWorkLocationById(
  supabase: SupabaseClient,
  locationId: string
): Promise<BranchRow | null> {
  const { data: workLoc } = await supabase
    .from("work_locations")
    .select("name, address, latitude, longitude, radius_meters")
    .eq("id", locationId)
    .maybeSingle<BranchRow>();

  return workLoc ?? null;
}

async function fetchDefaultBranchForTenant(
  supabase: SupabaseClient,
  tenantId: string | null | undefined
): Promise<BranchRow | null> {
  if (tenantId) {
    const { data: tenantBranch } = await supabase
      .from("office_branches")
      .select("name, address, latitude, longitude, radius_meters")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BranchRow>();
    if (hasValidCoords(tenantBranch)) {
      return tenantBranch;
    }
  }

  const { data: anyOfficeBranch } = await supabase
    .from("office_branches")
    .select("name, address, latitude, longitude, radius_meters")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BranchRow>();
  if (hasValidCoords(anyOfficeBranch)) {
    return anyOfficeBranch;
  }

  const { data: anyWorkLoc } = await supabase
    .from("work_locations")
    .select("name, address, latitude, longitude, radius_meters")
    .limit(1)
    .maybeSingle<BranchRow>();
  if (hasValidCoords(anyWorkLoc)) {
    return anyWorkLoc;
  }

  return null;
}

export async function resolveEmployeeGeofence(
  supabase: SupabaseClient,
  employee: GeofenceEmployeeInput
): Promise<ResolvedGeofence> {
  const targetDate =
    employee.effectiveDate?.trim() ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  let isEmergencyOverride = false;
  let overrideReason: string | null = null;
  let overrideMode: "onsite" | "wfh" | null = null;

  const { data: overrideRow, error: overrideError } = await supabase
    .from("employee_work_mode_overrides")
    .select("override_mode, reason")
    .eq("employee_id", employee.id)
    .eq("effective_date", targetDate)
    .maybeSingle<{ override_mode?: string | null; reason?: string | null }>();

  if (!overrideError && overrideRow?.override_mode) {
    const normalizedOverride = overrideRow.override_mode.trim().toLowerCase();
    if (normalizedOverride === "wfh" || normalizedOverride === "onsite") {
      isEmergencyOverride = true;
      overrideMode = normalizedOverride;
      overrideReason = overrideRow.reason ?? null;
    }
  }

  const rawMode = String(employee.work_mode ?? "onsite")
    .trim()
    .toLowerCase();
  const workMode: "onsite" | "hybrid" | "remote" =
    rawMode === "hybrid"
      ? "hybrid"
      : rawMode === "remote" || rawMode === "wfh"
        ? "remote"
        : "onsite";

  const { full: todayPhtDayName, short: todayPhtShort } = getPhtDayInfo();
  const todayLower = todayPhtDayName.toLowerCase();
  const todayShortLower = todayPhtShort.toLowerCase();

  // Phase 3: Check per-day `daily_work_modes` map (Mon..Sun) when no emergency override is active
  let dailyMapMode: "onsite" | "wfh" | "off" | null = null;
  if (!overrideMode && employee.daily_work_modes && typeof employee.daily_work_modes === "object") {
    const dwm = employee.daily_work_modes;
    const rawDaily =
      dwm[todayPhtShort] ??
      dwm[todayShortLower] ??
      dwm[todayPhtDayName] ??
      dwm[todayLower];
    const normDaily = String(rawDaily ?? "").trim().toLowerCase();
    if (normDaily === "wfh" || normDaily === "remote") {
      dailyMapMode = "wfh";
    } else if (normDaily === "rest" || normDaily === "off") {
      dailyMapMode = "off";
    } else if (normDaily === "onsite" || normDaily === "on-site") {
      dailyMapMode = "onsite";
    }
  }

  let isHybridRemoteDay = false;
  if (!overrideMode && !dailyMapMode && workMode === "hybrid") {
    let onsiteDays = normalizeDaysToFull(
      employee.onsite_days ??
        (Array.isArray(employee.hybrid_onsite_days)
          ? employee.hybrid_onsite_days
          : Array.isArray(employee.work_days)
            ? employee.work_days
            : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    );
    let wfhDays = normalizeDaysToFull(employee.wfh_days);

    if (!employee.onsite_days && !employee.wfh_days) {
      const { data: latestSchedule } = await supabase
        .from("schedules")
        .select("notes")
        .eq("employee_id", employee.id)
        .eq("is_published", true)
        .order("week_start", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ notes?: string | null }>();

      const parsed = parseHybridScheduleNotes(latestSchedule?.notes);
      if (parsed) {
        onsiteDays = parsed.onsiteDays;
        wfhDays = parsed.wfhDays;
      }
    }

    const isTodayWfh = wfhDays.some((d) => d.toLowerCase() === todayLower);
    const isTodayOnsite = onsiteDays.some((d) => d.toLowerCase() === todayLower);

    if (wfhDays.length > 0) {
      isHybridRemoteDay = isTodayWfh || !isTodayOnsite;
    } else {
      isHybridRemoteDay = !isTodayOnsite;
    }
  }

  const resolvedDayModel = dailyMapMode ?? employee.todayDailyModel ?? null;
  const isRemoteDay = overrideMode
    ? overrideMode === "wfh"
    : resolvedDayModel === "wfh" ||
      (!resolvedDayModel && (workMode === "remote" || isHybridRemoteDay));
  const isDayOff = !overrideMode && resolvedDayModel === "off";
  const effectiveWorkMode: "onsite" | "wfh" | "off" = isDayOff
    ? "off"
    : isRemoteDay
      ? "wfh"
      : "onsite";

  const withOverrideMeta = <T extends ResolvedGeofence>(res: T): T => ({
    ...res,
    isEmergencyOverride,
    overrideReason,
    effectiveWorkMode,
  });

  if (isRemoteDay) {
    type RemoteRow = {
      address?: string | null;
      latitude?: number | string | null;
      longitude?: number | string | null;
      radius_meters?: number | null;
      geofence_radius_meters?: number | null;
      approval_status?: string | null;
      is_active?: boolean | null;
    };

    const { data: remoteRes } = await supabase
      .from("employee_remote_residences")
      .select("*")
      .eq("employee_id", employee.id)
      .maybeSingle<RemoteRow>();

    const isApprovedRemote =
      Boolean(remoteRes) &&
      remoteRes?.approval_status !== "rejected" &&
      remoteRes?.approval_status !== "pending" &&
      (remoteRes?.approval_status === "approved" || remoteRes?.is_active === true);

    const resolvedRadius =
      Number(remoteRes?.radius_meters ?? remoteRes?.geofence_radius_meters) || 200;

    if (
      isApprovedRemote &&
      remoteRes &&
      remoteRes.latitude != null &&
      remoteRes.longitude != null &&
      !Number.isNaN(Number(remoteRes.latitude)) &&
      !Number.isNaN(Number(remoteRes.longitude))
    ) {
      return withOverrideMeta({
        configured: true,
        mode: "remote_residence",
        name: "Registered Remote Residence",
        address: remoteRes.address ?? null,
        latitude: Number(remoteRes.latitude),
        longitude: Number(remoteRes.longitude),
        radiusMeters: resolvedRadius,
      });
    }

    return withOverrideMeta({
      configured: false,
      mode: "remote_residence",
      error:
        remoteRes?.approval_status === "pending"
          ? "WFH clock-in blocked: your remote residence is still pending HR approval."
          : remoteRes?.approval_status === "rejected"
            ? "WFH clock-in blocked: your remote residence was rejected by HR. Please update and resubmit."
            : "WFH clock-in blocked: no HR-approved remote residence geofence configured for your account.",
      name: "Remote Residence",
      address: remoteRes?.address ?? null,
      radiusMeters: resolvedRadius,
    });
  }

  if (isDayOff && (workMode === "hybrid" || workMode === "remote")) {
    const { data: remoteRow } = await supabase
      .from("employee_remote_residences")
      .select("address, latitude, longitude, radius_meters, geofence_radius_meters, approval_status, is_active")
      .eq("employee_id", employee.id)
      .maybeSingle<{
        address?: string | null;
        latitude?: number | string | null;
        longitude?: number | string | null;
        radius_meters?: number | null;
        geofence_radius_meters?: number | null;
        approval_status?: string | null;
        is_active?: boolean | null;
      }>();

    const isApprovedRemote =
      Boolean(remoteRow) &&
      remoteRow?.approval_status !== "rejected" &&
      remoteRow?.approval_status !== "pending" &&
      (remoteRow?.approval_status === "approved" || remoteRow?.is_active === true);

    const remoteRadius =
      Number(remoteRow?.radius_meters ?? remoteRow?.geofence_radius_meters) || 200;

    if (isApprovedRemote && hasValidCoords(remoteRow)) {
      return {
        configured: true,
        mode: "remote_residence",
        name: "Registered Remote Residence • Day Off",
        address: remoteRow.address ?? null,
        latitude: Number(remoteRow.latitude),
        longitude: Number(remoteRow.longitude),
        radiusMeters: remoteRadius,
      };
    }
  }

  let branch: BranchRow | null = null;
  if (employee.work_location_id) {
    branch = await fetchOfficeBranchById(supabase, employee.work_location_id);
  }

  if (!hasValidCoords(branch) && employee.fallback_work_location_id) {
    branch = await fetchOfficeBranchById(supabase, employee.fallback_work_location_id);
  }

  if (!hasValidCoords(branch)) {
    const defaultBranch = await fetchDefaultBranchForTenant(
      supabase,
      employee.tenant_id
    );
    if (defaultBranch) {
      branch = defaultBranch;
    }
  }

  if (!hasValidCoords(branch) && employee.work_location_id) {
    branch = await fetchWorkLocationById(supabase, employee.work_location_id);
  }

  if (hasValidCoords(branch)) {
    return withOverrideMeta({
      configured: true,
      mode: "office_branch",
      name: isDayOff
        ? `${branch.name || "Office Branch"} • Day Off`
        : branch.name || "Assigned Office Branch",
      address: branch.address ?? null,
      latitude: Number(branch.latitude),
      longitude: Number(branch.longitude),
      radiusMeters: Number(branch.radius_meters) || 200,
    });
  }

  if (isDayOff) {
    const { data: remoteRow } = await supabase
      .from("employee_remote_residences")
      .select("address, latitude, longitude, radius_meters, approval_status, is_active")
      .eq("employee_id", employee.id)
      .maybeSingle<{
        address?: string | null;
        latitude?: number | string | null;
        longitude?: number | string | null;
        radius_meters?: number | null;
        approval_status?: string | null;
        is_active?: boolean | null;
      }>();
    const hasWfh =
      Boolean(remoteRow) &&
      (remoteRow?.approval_status === "approved" || remoteRow?.is_active === true);
    return withOverrideMeta({
      configured: true,
      mode: "office_branch",
      name: hasWfh ? "Scheduled Day Off · WFH Verified" : "Scheduled Day Off",
      address: remoteRow?.address ?? "No shift scheduled today",
      latitude: Number(remoteRow?.latitude ?? 14.5995),
      longitude: Number(remoteRow?.longitude ?? 120.9842),
      radiusMeters: Number(remoteRow?.radius_meters) || 200,
    });
  }

  return withOverrideMeta({
    configured: false,
    mode: "office_branch",
    error: "No office branch geofence configured for your account.",
    name: branch?.name || "Office Branch",
    address: branch?.address ?? null,
    radiusMeters: Number(branch?.radius_meters) || 200,
  });
}

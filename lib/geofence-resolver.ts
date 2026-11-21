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
    }
  | {
      configured: false;
      mode: "remote_residence" | "office_branch";
      error: string;
      name: string;
      address: string | null;
      radiusMeters: number;
    };

export interface GeofenceEmployeeInput {
  id: string;
  tenant_id?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  fallback_work_location_id?: string | null;
  hybrid_onsite_days?: string[] | null;
  work_days?: string[] | null;
  onsite_days?: string[] | null;
  wfh_days?: string[] | null;
  todayDailyModel?: "onsite" | "wfh" | "off";
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

async function fetchBranchById(
  supabase: SupabaseClient,
  locationId: string
): Promise<BranchRow | null> {
  const { data: workLoc } = await supabase
    .from("work_locations")
    .select("name, address, latitude, longitude, radius_meters")
    .eq("id", locationId)
    .maybeSingle<BranchRow>();

  if (workLoc) return workLoc;

  const { data: officeBranch } = await supabase
    .from("office_branches")
    .select("name, address, latitude, longitude, radius_meters")
    .eq("id", locationId)
    .maybeSingle<BranchRow>();

  return officeBranch ?? null;
}

async function fetchDefaultBranchForTenant(
  supabase: SupabaseClient,
  tenantId: string | null | undefined
): Promise<BranchRow | null> {
  for (const table of ["office_branches", "work_locations"] as const) {
    let defaultQuery = supabase
      .from(table)
      .select("name, address, latitude, longitude, radius_meters")
      .eq("is_default", true);
    if (tenantId && table === "office_branches") {
      defaultQuery = defaultQuery.eq("tenant_id", tenantId);
    }
    const { data: defaultRow } = await defaultQuery.limit(1).maybeSingle<BranchRow>();
    if (hasValidCoords(defaultRow)) {
      return defaultRow;
    }

    if (tenantId && table === "office_branches") {
      const { data: firstTenantRow } = await supabase
        .from(table)
        .select("name, address, latitude, longitude, radius_meters")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle<BranchRow>();
      if (hasValidCoords(firstTenantRow)) {
        return firstTenantRow;
      }
    }

    const { data: anyDefaultRow } = await supabase
      .from(table)
      .select("name, address, latitude, longitude, radius_meters")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle<BranchRow>();
    if (hasValidCoords(anyDefaultRow)) {
      return anyDefaultRow;
    }

    const { data: anyBranchRow } = await supabase
      .from(table)
      .select("name, address, latitude, longitude, radius_meters")
      .limit(1)
      .maybeSingle<BranchRow>();
    if (hasValidCoords(anyBranchRow)) {
      return anyBranchRow;
    }
  }

  return null;
}

export async function resolveEmployeeGeofence(
  supabase: SupabaseClient,
  employee: GeofenceEmployeeInput
): Promise<ResolvedGeofence> {
  const rawMode = String(employee.work_mode ?? "onsite")
    .trim()
    .toLowerCase();
  const workMode: "onsite" | "hybrid" | "remote" =
    rawMode === "hybrid"
      ? "hybrid"
      : rawMode === "remote" || rawMode === "wfh"
        ? "remote"
        : "onsite";

  const { full: todayPhtDayName } = getPhtDayInfo();
  const todayLower = todayPhtDayName.toLowerCase();

  let isHybridRemoteDay = false;
  if (workMode === "hybrid") {
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

  const isRemoteDay =
    employee.todayDailyModel === "wfh" ||
    (!employee.todayDailyModel && (workMode === "remote" || isHybridRemoteDay));
  const isDayOff = employee.todayDailyModel === "off";

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
      return {
        configured: true,
        mode: "remote_residence",
        name: "Registered Remote Residence",
        address: remoteRes.address ?? null,
        latitude: Number(remoteRes.latitude),
        longitude: Number(remoteRes.longitude),
        radiusMeters: resolvedRadius,
      };
    }

    return {
      configured: false,
      mode: "remote_residence",
      error:
        "Remote residence geofence not configured. Ask HR to set your home coordinates.",
      name: "Remote Residence",
      address: remoteRes?.address ?? null,
      radiusMeters: resolvedRadius,
    };
  }

  let branch: BranchRow | null = null;
  if (employee.work_location_id) {
    branch = await fetchBranchById(supabase, employee.work_location_id);
  }

  if (!hasValidCoords(branch) && employee.fallback_work_location_id) {
    branch = await fetchBranchById(supabase, employee.fallback_work_location_id);
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

  if (hasValidCoords(branch)) {
    return {
      configured: true,
      mode: "office_branch",
      name: isDayOff
        ? `${branch.name || "Office Branch"} · Day Off`
        : branch.name || "Assigned Office Branch",
      address: branch.address ?? null,
      latitude: Number(branch.latitude),
      longitude: Number(branch.longitude),
      radiusMeters: Number(branch.radius_meters) || 200,
    };
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
    return {
      configured: true,
      mode: "office_branch",
      name: hasWfh ? "Scheduled Day Off · WFH Verified" : "Scheduled Day Off",
      address: remoteRow?.address ?? "No shift scheduled today",
      latitude: Number(remoteRow?.latitude ?? 14.5995),
      longitude: Number(remoteRow?.longitude ?? 120.9842),
      radiusMeters: Number(remoteRow?.radius_meters) || 200,
    };
  }

  return {
    configured: false,
    mode: "office_branch",
    error: "No office branch geofence configured for your account.",
    name: branch?.name || "Office Branch",
    address: branch?.address ?? null,
    radiusMeters: Number(branch?.radius_meters) || 200,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

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
  work_model?: string | null;
  work_location_id?: string | null;
  hybrid_onsite_days?: string[] | null;
  work_days?: string[] | null;
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
  for (const table of ["work_locations", "office_branches"] as const) {
    let defaultQuery = supabase
      .from(table)
      .select("name, address, latitude, longitude, radius_meters")
      .eq("is_default", true);
    if (tenantId) {
      defaultQuery = defaultQuery.eq("tenant_id", tenantId);
    }
    const { data: defaultRow } = await defaultQuery.limit(1).maybeSingle<BranchRow>();
    if (hasValidCoords(defaultRow)) {
      return defaultRow;
    }

    if (tenantId) {
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
  }

  return null;
}

export async function resolveEmployeeGeofence(
  supabase: SupabaseClient,
  employee: GeofenceEmployeeInput
): Promise<ResolvedGeofence> {
  const rawMode = String(employee.work_mode ?? employee.work_model ?? "onsite")
    .trim()
    .toLowerCase();
  const workMode: "onsite" | "hybrid" | "remote" =
    rawMode === "hybrid"
      ? "hybrid"
      : rawMode === "remote" || rawMode === "wfh"
        ? "remote"
        : "onsite";

  const todayDayName = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const hybridOnsiteDays = Array.isArray(employee.hybrid_onsite_days)
    ? employee.hybrid_onsite_days
    : Array.isArray(employee.work_days)
      ? employee.work_days
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const isHybridRemoteDay =
    workMode === "hybrid" &&
    !hybridOnsiteDays.some((d) => d.trim().toLowerCase() === todayDayName);
  const isRemoteDay = workMode === "remote" || isHybridRemoteDay;

  if (isRemoteDay) {
    type RemoteRow = {
      address?: string | null;
      latitude?: number | string | null;
      longitude?: number | string | null;
      geofence_radius_meters?: number | null;
    };

    let remoteRes: RemoteRow | null = null;
    const { data: activeRemote, error: activeRemoteError } = await supabase
      .from("employee_remote_residences")
      .select("address, latitude, longitude, geofence_radius_meters")
      .eq("employee_id", employee.id)
      .eq("is_active", true)
      .maybeSingle<RemoteRow>();

    if (activeRemoteError) {
      const { data: fallbackRemote } = await supabase
        .from("employee_remote_residences")
        .select("address, latitude, longitude, geofence_radius_meters")
        .eq("employee_id", employee.id)
        .maybeSingle<RemoteRow>();
      remoteRes = fallbackRemote ?? null;
    } else {
      remoteRes = activeRemote ?? null;
    }

    if (
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
        radiusMeters: Number(remoteRes.geofence_radius_meters) || 200,
      };
    }

    return {
      configured: false,
      mode: "remote_residence",
      error:
        "Remote residence geofence not configured. Ask HR to set your home coordinates.",
      name: "Remote Residence",
      address: remoteRes?.address ?? null,
      radiusMeters: Number(remoteRes?.geofence_radius_meters) || 200,
    };
  }

  let branch: BranchRow | null = null;
  if (employee.work_location_id) {
    branch = await fetchBranchById(supabase, employee.work_location_id);
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
      name: branch.name || "Assigned Office Branch",
      address: branch.address ?? null,
      latitude: Number(branch.latitude),
      longitude: Number(branch.longitude),
      radiusMeters: Number(branch.radius_meters) || 200,
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

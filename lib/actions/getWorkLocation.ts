"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkLocation } from "@/lib/types";

type WorkSetupMode = "onsite" | "remote" | "wfh" | "hybrid" | "unknown";

export interface ClockInReferenceLocation {
  mode: WorkSetupMode;
  requiresGeofence: boolean;
  location: WorkLocation | null;
  missingReason: string | null;
}

const FALLBACK_DEFAULT_LOCATION: WorkLocation = {
  id: "default-hq",
  name: "Manila Main Headquarters",
  address: "Padre Faura St, Ermita, Manila, Metro Manila",
  latitude: 14.5794,
  longitude: 120.9822,
  radius_meters: 200,
  is_default: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function normalizeWorkSetup(workSetup?: string | null): WorkSetupMode {
  const normalized = workSetup?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";

  if (normalized === "onsite" || normalized === "on_site") return "onsite";
  if (normalized === "remote") return "remote";
  if (normalized === "wfh" || normalized === "work_from_home") return "wfh";
  if (normalized === "hybrid") return "hybrid";

  return "unknown";
}

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Kayod-HR-Attendance-System (contact: dev@kayod.app)",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const { lat, lon } = data[0] as { lat?: string; lon?: string };
  const latitude = Number.parseFloat(lat ?? "");
  const longitude = Number.parseFloat(lon ?? "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export async function getEmployeeWorkLocation(
  employeeId?: string,
  profileId?: string
): Promise<WorkLocation> {
  const supabase = await createClient();

  // 1. Check if employee record has explicit work_location_id assigned
  if (employeeId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("work_location_id, work_locations(*)")
      .eq("id", employeeId)
      .maybeSingle();

    if (emp?.work_locations) {
      const loc = emp.work_locations as unknown as WorkLocation;
      return {
        ...loc,
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        radius_meters: Number(loc.radius_meters),
      };
    }

    if (emp?.work_location_id) {
      const { data: loc } = await supabase
        .from("work_locations")
        .select("*")
        .eq("id", emp.work_location_id)
        .maybeSingle<WorkLocation>();

      if (loc) {
        return {
          ...loc,
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          radius_meters: Number(loc.radius_meters),
        };
      }
    }
  }

  // 2. Check if profile has work_location_id assigned
  if (profileId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("work_location_id")
      .eq("id", profileId)
      .maybeSingle();

    if (prof?.work_location_id) {
      const { data: loc } = await supabase
        .from("work_locations")
        .select("*")
        .eq("id", prof.work_location_id)
        .maybeSingle<WorkLocation>();

      if (loc) {
        return {
          ...loc,
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          radius_meters: Number(loc.radius_meters),
        };
      }
    }
  }

  // 3. Fallback to global default site in work_locations table
  const { data: defaultSite } = await supabase
    .from("work_locations")
    .select("*")
    .eq("is_default", true)
    .maybeSingle<WorkLocation>();

  if (defaultSite) {
    return {
      ...defaultSite,
      latitude: Number(defaultSite.latitude),
      longitude: Number(defaultSite.longitude),
      radius_meters: Number(defaultSite.radius_meters),
    };
  }

  // 4. Ultimate fallback if DB has no seed records yet
  return FALLBACK_DEFAULT_LOCATION;
}

export async function getClockInReferenceLocation({
  employeeId,
  profileId,
  workSetup,
}: {
  employeeId?: string;
  profileId?: string;
  workSetup?: string | null;
}): Promise<ClockInReferenceLocation> {
  const mode = normalizeWorkSetup(workSetup);

  if (mode === "onsite") {
    const officeLocation = await getEmployeeWorkLocation(employeeId, profileId);
    return {
      mode,
      requiresGeofence: false,
      location: officeLocation,
      missingReason: null,
    };
  }

  if (mode === "remote" || mode === "wfh") {
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("address")
      .eq("id", profileId ?? "")
      .maybeSingle();

    const registeredAddress = profile?.address?.trim() ?? "";

    if (!registeredAddress) {
      return {
        mode,
        requiresGeofence: true,
        location: null,
        missingReason: "Remote/WFH clock-in needs profiles.address, but no address is stored for this employee.",
      };
    }

    const coordinates = await geocodeAddress(registeredAddress);

    if (!coordinates) {
      return {
        mode,
        requiresGeofence: true,
        location: null,
        missingReason: "Remote/WFH clock-in needs a geocodable profiles.address, but the address could not be resolved to coordinates.",
      };
    }

    const officeLocation = await getEmployeeWorkLocation(employeeId, profileId);

    return {
      mode,
      requiresGeofence: true,
      location: {
        id: `profile-address-${profileId ?? "unknown"}`,
        name: registeredAddress,
        address: registeredAddress,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        radius_meters: officeLocation.radius_meters,
        is_default: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      missingReason: null,
    };
  }

  const officeLocation = await getEmployeeWorkLocation(employeeId, profileId);

  return {
    mode,
    requiresGeofence: true,
    location: officeLocation,
    missingReason: null,
  };
}

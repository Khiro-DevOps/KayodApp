"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkLocation } from "@/lib/types";

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

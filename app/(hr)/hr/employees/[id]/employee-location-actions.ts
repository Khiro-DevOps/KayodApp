"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { WorkSetup } from "@/lib/types";

export async function updateEmployeeLocationAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Error("Tenant not found");

  const employeeId = formData.get("employee_id") as string;
  const workMode = formData.get("work_mode") as WorkSetup;
  const workLocationId = formData.get("work_location_id") as string;

  // Remote Residence fields
  const remoteAddress = formData.get("remote_address") as string;
  const remoteLat = parseFloat(formData.get("remote_lat") as string);
  const remoteLng = parseFloat(formData.get("remote_lng") as string);
  const remoteRadius = parseFloat(formData.get("remote_radius") as string) || 200;

  // 1. Update employee's work_model and work_location_id
  const { error: empError } = await supabase
    .from("employees")
    .update({
      work_model: workMode === "hybrid" || workMode === "remote" ? workMode : (workMode === "wfh" ? "wfh" : "onsite"),
      work_location_id: (workMode === "onsite" || workMode === "hybrid") && workLocationId ? workLocationId : null,
    })
    .eq("id", employeeId);

  if (empError) throw new Error(empError.message);

  // 2. Upsert employee_remote_residences if remote or hybrid
  if ((workMode === "remote" || workMode === "hybrid" || workMode === "wfh") && remoteAddress) {
    const { error: resError } = await supabase
      .from("employee_remote_residences")
      .upsert({
        employee_id: employeeId,
        tenant_id: tenantId,
        address: remoteAddress,
        latitude: remoteLat,
        longitude: remoteLng,
        geofence_radius_meters: remoteRadius,
        updated_by: user.id
      }, { onConflict: "employee_id" });
      
    if (resError) throw new Error(resError.message);
  }

  revalidatePath(`/hr/employees/${employeeId}`);
}

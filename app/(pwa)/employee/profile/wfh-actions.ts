"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";

export async function submitWfhLocationAction(input: {
  address: string;
  latitude: number;
  longitude: number;
  relocationReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const trimmedAddress = input.address.trim();
  if (!trimmedAddress) {
    return { success: false, error: "Please search or pin your WFH address." };
  }

  if (
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    Math.abs(input.latitude) > 90 ||
    Math.abs(input.longitude) > 180
  ) {
    return { success: false, error: "Invalid GPS coordinates." };
  }

  const admin = getAdminClient();
  let { data: employee } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!employee && user.email) {
    const { data: empByEmail } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("email", user.email)
      .maybeSingle<{ id: string; tenant_id: string | null }>();
    employee = empByEmail;
  }

  if (!employee) {
    return { success: false, error: "Employee record not found." };
  }

  const { data: existing } = await admin
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", employee.id)
    .maybeSingle<{
      id: string;
      is_active?: boolean | null;
      approval_status?: string | null;
    }>();

  const nowIso = new Date().toISOString();
  const hasActiveApproved =
    Boolean(existing) &&
    existing?.is_active !== false &&
    (existing?.approval_status === "approved" || !existing?.approval_status);

  if (hasActiveApproved && !input.relocationReason?.trim()) {
    return {
      success: false,
      error: "Please provide a relocation reason for changing an approved WFH address.",
    };
  }

  if (!existing) {
    const { error: insertErr } = await admin
      .from("employee_remote_residences")
      .insert({
        employee_id: employee.id,
        tenant_id: employee.tenant_id ?? "00000000-0000-0000-0000-000000000001",
        address: trimmedAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        geofence_radius_meters: 200,
        is_active: false,
        approval_status: "pending",
        pending_address: trimmedAddress,
        pending_latitude: input.latitude,
        pending_longitude: input.longitude,
        pending_radius_meters: 200,
        relocation_reason: input.relocationReason?.trim() || null,
        rejection_reason: null,
        updated_by: user.id,
        updated_at: nowIso,
      });

    if (insertErr) {
      return { success: false, error: insertErr.message };
    }
  } else if (hasActiveApproved) {
    // Keep active approved coordinates untouched until HR approves relocation
    const { error: updateErr } = await admin
      .from("employee_remote_residences")
      .update({
        approval_status: "pending",
        pending_address: trimmedAddress,
        pending_latitude: input.latitude,
        pending_longitude: input.longitude,
        pending_radius_meters: 200,
        relocation_reason: input.relocationReason?.trim() || null,
        rejection_reason: null,
        updated_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
  } else {
    const { error: updateErr } = await admin
      .from("employee_remote_residences")
      .update({
        address: trimmedAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        geofence_radius_meters: 200,
        is_active: false,
        approval_status: "pending",
        pending_address: trimmedAddress,
        pending_latitude: input.latitude,
        pending_longitude: input.longitude,
        pending_radius_meters: 200,
        relocation_reason: input.relocationReason?.trim() || null,
        rejection_reason: null,
        updated_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
  }

  revalidatePath("/employee/profile");
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${employee.id}`);

  return { success: true };
}

export async function reviewWfhLocationAction(input: {
  employeeId: string;
  decision: "approve" | "reject";
  rejectionReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;
  const role = effectiveRole(profile?.role, authRole);

  if (!isHRRole(role)) {
    return { success: false, error: "Forbidden: HR role required" };
  }

  const { data: residence } = await admin
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", input.employeeId)
    .maybeSingle<{
      id: string;
      address: string;
      latitude: number;
      longitude: number;
      geofence_radius_meters: number;
      is_active?: boolean | null;
      pending_address?: string | null;
      pending_latitude?: number | null;
      pending_longitude?: number | null;
      pending_radius_meters?: number | null;
    }>();

  if (!residence) {
    return { success: false, error: "WFH residence request not found." };
  }

  const nowIso = new Date().toISOString();

  if (input.decision === "approve") {
    const nextAddress = residence.pending_address ?? residence.address;
    const nextLat = residence.pending_latitude ?? residence.latitude;
    const nextLng = residence.pending_longitude ?? residence.longitude;
    const nextRadius =
      residence.pending_radius_meters ?? residence.geofence_radius_meters ?? 200;

    const { error: approveErr } = await admin
      .from("employee_remote_residences")
      .update({
        address: nextAddress,
        latitude: nextLat,
        longitude: nextLng,
        geofence_radius_meters: nextRadius,
        is_active: true,
        approval_status: "approved",
        pending_address: null,
        pending_latitude: null,
        pending_longitude: null,
        pending_radius_meters: null,
        relocation_reason: null,
        rejection_reason: null,
        reviewed_by: user.id,
        reviewed_at: nowIso,
        updated_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", residence.id);

    if (approveErr) {
      return { success: false, error: approveErr.message };
    }
  } else {
    const hadActiveApproved = residence.is_active === true;
    const { error: rejectErr } = await admin
      .from("employee_remote_residences")
      .update({
        is_active: hadActiveApproved,
        approval_status: hadActiveApproved ? "approved" : "rejected",
        pending_address: null,
        pending_latitude: null,
        pending_longitude: null,
        pending_radius_meters: null,
        relocation_reason: null,
        rejection_reason: input.rejectionReason?.trim() || "Declined by HR",
        reviewed_by: user.id,
        reviewed_at: nowIso,
        updated_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", residence.id);

    if (rejectErr) {
      return { success: false, error: rejectErr.message };
    }
  }

  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${input.employeeId}`);
  revalidatePath("/employee/profile");
  revalidatePath("/employee/schedule");

  return { success: true };
}

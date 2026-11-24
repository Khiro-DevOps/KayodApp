"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";

async function requireBranchSettingsPermission() {
  const ctx = await getHrSessionContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!canHr(ctx.hr_role, "settings:view", ctx.is_tenant_owner)) {
    throw new Error("Forbidden: insufficient HR permissions");
  }
  return ctx;
}

type MirrorBranchRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_primary?: boolean | null;
};

async function mirrorOfficeBranchToWorkLocation(branch: MirrorBranchRow) {
  const admin = getAdminClient();
  const { error } = await admin.from("work_locations").upsert(
    {
      id: branch.id,
      tenant_id: branch.tenant_id,
      name: branch.name,
      address: branch.address,
      latitude: Number(branch.latitude ?? 14.5995),
      longitude: Number(branch.longitude ?? 120.9842),
      radius_meters: branch.radius_meters ?? 200,
      is_default: Boolean(branch.is_primary),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[branch-actions] Failed to mirror office_branch to work_locations:", error.message);
  }
}

export async function createBranchAction(formData: FormData) {
  const ctx = await requireBranchSettingsPermission();
  const supabase = await createClient();
  const tenantId = ctx.tenant_id;
  if (!tenantId) throw new Error("Tenant not found");

  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);
  const radius = parseFloat(formData.get("radius_meters") as string) || 200;

  const { data: inserted, error } = await supabase
    .from("office_branches")
    .insert({
      tenant_id: tenantId,
      name,
      address,
      latitude,
      longitude,
      radius_meters: radius,
    })
    .select("id, tenant_id, name, address, latitude, longitude, radius_meters, is_primary")
    .single<MirrorBranchRow>();

  if (error) throw new Error(error.message);
  if (inserted) {
    await mirrorOfficeBranchToWorkLocation(inserted);
  }

  revalidatePath("/hr/settings/branches");
  revalidatePath("/hr/employees");
  revalidatePath("/employee/profile");
  revalidatePath("/employee/schedule");
}

export async function updateBranchAction(formData: FormData) {
  await requireBranchSettingsPermission();
  const supabase = await createClient();

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);
  const radius = parseFloat(formData.get("radius_meters") as string) || 200;

  const { data: updated, error } = await supabase
    .from("office_branches")
    .update({
      name,
      address,
      latitude,
      longitude,
      radius_meters: radius,
    })
    .eq("id", id)
    .select("id, tenant_id, name, address, latitude, longitude, radius_meters, is_primary")
    .single<MirrorBranchRow>();

  if (error) throw new Error(error.message);
  if (updated) {
    await mirrorOfficeBranchToWorkLocation(updated);
  }

  revalidatePath("/hr/settings/branches");
  revalidatePath("/hr/employees");
  revalidatePath("/employee/profile");
  revalidatePath("/employee/schedule");
}

export async function deleteBranchAction(formData: FormData) {
  await requireBranchSettingsPermission();
  const supabase = await createClient();

  const id = formData.get("id") as string;

  const { error } = await supabase.from("office_branches").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const admin = getAdminClient();
  await admin.from("work_locations").delete().eq("id", id);

  revalidatePath("/hr/settings/branches");
  revalidatePath("/hr/employees");
  revalidatePath("/employee/profile");
  revalidatePath("/employee/schedule");
}

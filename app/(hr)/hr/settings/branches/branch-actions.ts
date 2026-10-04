"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createBranchAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Error("Tenant not found");

  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);
  const radius = parseFloat(formData.get("radius_meters") as string) || 200;

  const { error } = await supabase.from("office_branches").insert({
    tenant_id: tenantId,
    name,
    address,
    latitude,
    longitude,
    radius_meters: radius,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/hr/settings/branches");
}

export async function updateBranchAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);
  const radius = parseFloat(formData.get("radius_meters") as string) || 200;

  const { error } = await supabase.from("office_branches").update({
    name,
    address,
    latitude,
    longitude,
    radius_meters: radius,
  }).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/settings/branches");
}

export async function deleteBranchAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;

  const { error } = await supabase.from("office_branches").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/settings/branches");
}

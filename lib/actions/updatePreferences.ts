"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateNotificationPreference(
  key: "email_notifications" | "push_notifications",
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        [key]: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error(`Failed to update ${key}:`, error.message);
      return { success: false, error: error.message };
    }

    revalidatePath("/employee/profile");
    revalidatePath("/hr/profile");
    return { success: true };
  } catch (err: any) {
    console.error("updateNotificationPreference exception:", err);
    return { success: false, error: err?.message || "Server error updating preferences" };
  }
}

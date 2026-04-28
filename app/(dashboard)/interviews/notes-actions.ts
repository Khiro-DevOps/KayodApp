"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveInterviewNotes(
  interviewId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (!isHR) {
    return { success: false, error: "Unauthorized" };
  }

  // Update interview with notes and mark as completed
  const { error: updateError } = await supabase
    .from("interviews")
    .update({
      interviewer_notes: notes,
      status: "completed",
    })
    .eq("id", interviewId);

  if (updateError) {
    console.error("Error updating interview:", updateError);
    return { success: false, error: "Failed to save interview notes" };
  }

  return { success: true };
}

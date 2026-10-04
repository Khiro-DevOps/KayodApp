"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface WithdrawApplicationResponse {
  success: boolean;
  error?: string;
}

/**
 * Server action to withdraw a job application for the current authenticated user.
 * 
 * Sets the application status to 'withdrawn' and updates the withdrawn_at timestamp.
 */
export async function withdrawApplication(applicationId: string): Promise<WithdrawApplicationResponse> {
  try {
    if (!applicationId) {
      return { success: false, error: "Application ID is required." };
    }

    const supabase = await createClient();

    // 1. Get authenticated user session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthorized: User not authenticated." };
    }

    // 2. Verify ownership and update status in job_applications table
    // First try job_applications table
    const { data: jobAppRecord, error: fetchJobAppError } = await supabase
      .from("job_applications")
      .select("id, applicant_id, status")
      .eq("id", applicationId)
      .maybeSingle();

    if (fetchJobAppError) {
      console.error("Error fetching job_application:", fetchJobAppError);
    }

    if (jobAppRecord) {
      if (jobAppRecord.applicant_id !== user.id) {
        return { success: false, error: "Forbidden: You do not own this application." };
      }

      if (jobAppRecord.status === "withdrawn") {
        return { success: false, error: "Application is already withdrawn." };
      }

      const { error: updateError } = await supabase
        .from("job_applications")
        .update({
          status: "withdrawn",
          withdrawn_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId)
        .eq("applicant_id", user.id);

      if (updateError) {
        console.error("Error updating job_application status:", updateError);
        return { success: false, error: updateError.message || "Failed to withdraw application." };
      }
    } else {
      // Fallback check on `applications` table if job_applications row was not found
      const { data: appRecord, error: fetchAppError } = await supabase
        .from("applications")
        .select("id, candidate_id, status")
        .eq("id", applicationId)
        .maybeSingle();

      if (fetchAppError || !appRecord) {
        return { success: false, error: "Application record not found." };
      }

      if (appRecord.candidate_id !== user.id) {
        return { success: false, error: "Forbidden: You do not own this application." };
      }

      if (appRecord.status === "withdrawn") {
        return { success: false, error: "Application is already withdrawn." };
      }

      const { error: updateAppError } = await supabase
        .from("applications")
        .update({
          status: "withdrawn",
          withdrawn_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId)
        .eq("candidate_id", user.id);

      if (updateAppError) {
        console.error("Error updating applications status:", updateAppError);
        return { success: false, error: updateAppError.message || "Failed to withdraw application." };
      }
    }

    // 3. Revalidate applicant applications page path
    revalidatePath("/applicant/applications");

    return { success: true };
  } catch (err: unknown) {
    console.error("Unexpected error in withdrawApplication:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
    return { success: false, error: errorMessage };
  }
}

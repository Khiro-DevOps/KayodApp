"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export interface ResetApplicantTestDataResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function resetApplicantTestData(): Promise<ResetApplicantTestDataResult> {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    // 1. Authenticate caller session
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const userId = user.id;

    // 2. Delete all records for auth.uid() from job_applications
    // (Explicitly delete interview_schedules or let cascade delete handle it)
    // First, fetch job_applications IDs to clean up interview_schedules if FK cascade is not set
    const { data: jobApps } = await admin
      .from("job_applications")
      .select("id")
      .eq("applicant_id", userId);

    if (jobApps && jobApps.length > 0) {
      const jobAppIds = jobApps.map((app) => app.id);
      await admin
        .from("interview_schedules")
        .delete()
        .in("application_id", jobAppIds);

      await admin
        .from("job_applications")
        .delete()
        .eq("applicant_id", userId);
    }

    // Also delete any interviews linked directly by applicant_id or candidate_id if present
    await admin
      .from("interview_schedules")
      .delete()
      .eq("applicant_id", userId);

    // Delete legacy applications table entries if any
    await admin
      .from("applications")
      .delete()
      .eq("candidate_id", userId);

    // 3. Delete employee_onboarding_documents
    await admin
      .from("employee_onboarding_documents")
      .delete()
      .eq("employee_id", userId);

    // Also clean up onboarding documents linked via employee ID if record exists
    const { data: empRecord } = await admin
      .from("employees")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (empRecord) {
      await admin
        .from("employee_onboarding_documents")
        .delete()
        .eq("employee_id", empRecord.id);

      // 4. Delete employees record (if created during promotion tests for profile_id = auth.uid())
      await admin
        .from("employees")
        .delete()
        .eq("id", empRecord.id);
    }

    // Ensure any employee record with profile_id is deleted
    await admin
      .from("employees")
      .delete()
      .eq("profile_id", userId);

    // 5. Reset profiles.role back to 'applicant' if it was changed during promotion testing
    await admin
      .from("profiles")
      .update({ role: "applicant", updated_at: new Date().toISOString() })
      .eq("id", userId);

    // Update user auth metadata role as well for consistency
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...user.user_metadata,
          role: "applicant",
        },
      });
    } catch (metaErr) {
      console.warn("Failed to update user_metadata role during test reset:", metaErr);
    }

    // 6. Revalidate specified paths
    revalidatePath("/applicant/applications");
    revalidatePath("/applicant/jobs");
    revalidatePath("/applicant/interviews");
    revalidatePath("/hr/interviews");
    revalidatePath("/hr/employees");

    return {
      success: true,
      message: "Test application data wiped successfully!",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset test data";
    return { success: false, error: message };
  }
}

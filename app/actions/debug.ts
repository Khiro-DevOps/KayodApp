"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function resolveUserId(email?: string) {
  const normalizedEmail = email?.trim();

  if (normalizedEmail) {
    const admin = getAdminClient();

    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      return {
        userId: null,
        error: error.message,
      };
    }

    if (!profile) {
      return {
        userId: null,
        error: `No profile was found for ${normalizedEmail}.`,
      };
    }

    return {
      userId: profile.id,
      error: null,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      error: "No authenticated user was found.",
    };
  }

  return {
    userId: user.id,
    error: null,
  };
}

export async function resetApplicantTestData(email?: string) {
  if (process.env.NODE_ENV !== "development") {
    return {
      success: false,
      error: "Developer reset controls are only available in development.",
    };
  }

  try {
    const admin = getAdminClient();

    const result = await resolveUserId(email);

    if (!result.userId) {
      return {
        success: false,
        error: result.error ?? "Unable to resolve user.",
      };
    }

    const userId = result.userId;

    const { data: applications, error: applicationsLookupError } = await admin
      .from("job_applications")
      .select("id")
      .eq("applicant_id", userId);

    if (applicationsLookupError) {
      return {
        success: false,
        error: applicationsLookupError.message,
      };
    }

    const applicationIds = (applications ?? [])
      .map((application) => application.id)
      .filter(Boolean);

    let deletedInterviewSchedules = 0;

    if (applicationIds.length > 0) {
      const { data: deletedSchedules, error: schedulesError } = await admin
        .from("interview_schedules")
        .delete()
        .in("application_id", applicationIds)
        .select("id");

      if (schedulesError) {
        return {
          success: false,
          error: schedulesError.message,
        };
      }

      deletedInterviewSchedules = deletedSchedules?.length ?? 0;
    }

    const { data: deletedApplications, error: applicationsDeleteError } =
      await admin
        .from("job_applications")
        .delete()
        .eq("applicant_id", userId)
        .select("id");

    if (applicationsDeleteError) {
      return {
        success: false,
        error: applicationsDeleteError.message,
      };
    }

    const deletedApplicationCount = deletedApplications?.length ?? 0;

    if (deletedApplicationCount === 0) {
      return {
        success: true,
        message: "No application data was found for this account.",
        deletedApplications: 0,
        deletedInterviewSchedules,
        profileId: userId,
      };
    }

    return {
      success: true,
      message: `Deleted ${deletedApplicationCount} application(s) and ${deletedInterviewSchedules} interview schedule(s).`,
      deletedApplications: deletedApplicationCount,
      deletedInterviewSchedules,
      profileId: userId,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to reset applicant test data.",
    };
  }
}
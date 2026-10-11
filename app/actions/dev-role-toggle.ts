"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type DevRole = "applicant" | "employee" | "hr_manager";

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

export async function toggleDevUserRole(
  targetRole: DevRole,
  email?: string
) {
  if (process.env.NODE_ENV !== "development") {
    return {
      success: false,
      error: "Developer role controls are only available in development.",
    };
  }

  try {
    const admin = getAdminClient();
    const normalizedEmail = email?.trim();
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      return {
        success: false,
        error: "No authenticated user was found.",
      };
    }

    let userId: string;

    if (normalizedEmail) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, email, role")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profileError) {
        return {
          success: false,
          error: profileError.message,
        };
      }

      if (!profile) {
        return {
          success: false,
          error: `No profile was found for ${normalizedEmail}.`,
        };
      }

      userId = profile.id;
    } else {
      // Explicit intent: target current user when email is omitted/empty
      userId = currentUser.id;
    }

    const isCurrentUser = currentUser.id === userId;
    const dbRole = targetRole === "applicant" ? "candidate" : targetRole;

    const { data: updatedProfiles, error: updateError } = await admin
      .from("profiles")
      .update({
        role: dbRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, email, role");

    if (updateError) {
      return {
        success: false,
        error: updateError.message,
      };
    }

    if (!updatedProfiles || updatedProfiles.length === 0) {
      return {
        success: false,
        error: "No rows updated",
      };
    }

    const updatedProfile = updatedProfiles[0];

    const { error: metadataError } = await admin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: { role: targetRole },
      }
    );

    if (metadataError) {
      // Rollback profile role change if metadata update fails
      await admin
        .from("profiles")
        .update({
          role: "candidate",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      return {
        success: false,
        error: metadataError.message,
      };
    }

    if (targetRole === "employee") {
      const { data: existingEmployee, error: employeeLookupError } = await admin
        .from("employees")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();

      if (employeeLookupError) {
        // Rollback profile/metadata
        await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
        await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "applicant" } });
        return {
          success: false,
          error: employeeLookupError.message,
        };
      }

      if (existingEmployee) {
        const { error: employeeUpdateError } = await admin
          .from("employees")
          .update({
            employment_status: "active",
            end_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingEmployee.id);

        if (employeeUpdateError) {
          await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
          await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "applicant" } });
          return {
            success: false,
            error: employeeUpdateError.message,
          };
        }
      } else {
        const { error: employeeInsertError } = await admin
          .from("employees")
          .insert({
            profile_id: userId,
            job_title: "Development Employee",
            employment_type: "full_time",
            employment_status: "active",
            start_date: new Date().toISOString().split("T")[0],
            base_salary: 0,
          });

        if (employeeInsertError) {
          await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
          await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "applicant" } });
          return {
            success: false,
            error: employeeInsertError.message,
          };
        }
      }
    }

    const targetRoute =
      targetRole === "employee"
        ? "/employee/dashboard"
        : targetRole === "hr_manager"
          ? "/hr/dashboard"
          : "/applicant/jobs";

    return {
      success: true,
      message: `Account role changed to ${targetRole}.`,
      newRole: targetRole,
      targetRoute,
      isCurrentUser,
      profile: updatedProfile,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to change account role.",
    };
  }
}
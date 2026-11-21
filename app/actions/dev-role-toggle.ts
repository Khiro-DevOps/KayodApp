"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import { resolveContractWorkSetup, resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";

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
        user_metadata: { role: dbRole },
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
      const { data: userProfile } = await admin
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle<{ tenant_id: string | null }>();

      let resolvedTenantId = userProfile?.tenant_id ?? null;
      if (!resolvedTenantId) {
        const { data: firstTenant } = await admin
          .from("tenants")
          .select("id")
          .limit(1)
          .maybeSingle<{ id: string }>();
        resolvedTenantId = firstTenant?.id ?? null;
      }

      let defaultBranchId: string | null = null;
      if (resolvedTenantId) {
        const { data: tenantBranch } = await admin
          .from("office_branches")
          .select("id")
          .eq("tenant_id", resolvedTenantId)
          .limit(1)
          .maybeSingle<{ id: string }>();
        defaultBranchId = tenantBranch?.id ?? null;
      }
      if (!defaultBranchId) {
        const { data: anyBranch } = await admin
          .from("office_branches")
          .select("id")
          .limit(1)
          .maybeSingle<{ id: string }>();
        defaultBranchId = anyBranch?.id ?? null;
      }

      const linkedJob = await getJobPostingPositionForProfile(userId);

      const { data: existingEmployee, error: employeeLookupError } = await admin
        .from("employees")
        .select("id, tenant_id, work_location_id, work_mode, base_salary, salary, job_title, department_id")
        .eq("profile_id", userId)
        .maybeSingle<{
          id: string;
          tenant_id: string | null;
          work_location_id: string | null;
          work_mode: string | null;
          base_salary: number | null;
          salary: number | null;
          job_title: string | null;
          department_id: string | null;
        }>();

      if (employeeLookupError) {
        // Rollback profile/metadata
        await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
        await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "candidate" } });
        return {
          success: false,
          error: employeeLookupError.message,
        };
      }

      let resolvedEmployeeId: string;
      const sourceOfTruth = resolveEmployeeSourceOfTruth({
        employee: existingEmployee ? { job_title: existingEmployee.job_title, work_mode: existingEmployee.work_mode } : null,
        offer: linkedJob ? { job_title: linkedJob.offerTitle, work_setup: linkedJob.offerWorkSetup } : null,
        jobPosting: linkedJob ? { title: linkedJob.title, department: linkedJob.departmentName, work_setup: linkedJob.jobWorkSetup } : null,
      });
      const resolvedPosition = sourceOfTruth.position;
      const resolvedDepartmentId =
        linkedJob?.departmentId ?? existingEmployee?.department_id ?? null;
      const resolvedWorkMode = resolveContractWorkSetup({
        offerWorkSetup: linkedJob?.offerWorkSetup,
        jobWorkSetup: linkedJob?.jobWorkSetup,
        employeeWorkSetup: existingEmployee?.work_mode,
      });
      const resolvedWorkLocationId =
        linkedJob?.workLocationId ?? existingEmployee?.work_location_id ?? defaultBranchId;

      if (existingEmployee) {
        const nextSalary =
          existingEmployee.base_salary && existingEmployee.base_salary > 0
            ? existingEmployee.base_salary
            : existingEmployee.salary && existingEmployee.salary > 0
              ? existingEmployee.salary
              : 45000;

        const { error: employeeUpdateError } = await admin
          .from("employees")
          .update({
            employment_status: "active",
            end_date: null,
            tenant_id: existingEmployee.tenant_id ?? resolvedTenantId,
            job_title: resolvedPosition,
            department_id: resolvedDepartmentId,
            work_location_id: resolvedWorkLocationId,
            work_mode: resolvedWorkMode,
            base_salary: nextSalary,
            salary: nextSalary,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingEmployee.id);

        if (employeeUpdateError) {
          await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
          await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "candidate" } });
          return {
            success: false,
            error: employeeUpdateError.message,
          };
        }
        resolvedEmployeeId = existingEmployee.id;
      } else {
        const { data: insertedEmployee, error: employeeInsertError } = await admin
          .from("employees")
          .insert({
            profile_id: userId,
            tenant_id: resolvedTenantId,
            job_title: resolvedPosition,
            department_id: resolvedDepartmentId,
            employment_type: "full_time",
            employment_status: "active",
            work_mode: resolvedWorkMode,
            work_location_id: resolvedWorkLocationId,
            start_date: new Date().toISOString().split("T")[0],
            base_salary: 45000,
            salary: 45000,
          })
          .select("id")
          .single<{ id: string }>();

        if (employeeInsertError || !insertedEmployee) {
          await admin.from("profiles").update({ role: "candidate", updated_at: new Date().toISOString() }).eq("id", userId);
          await admin.auth.admin.updateUserById(userId, { user_metadata: { role: "candidate" } });
          return {
            success: false,
            error: employeeInsertError?.message ?? "Failed to create employee record.",
          };
        }
        resolvedEmployeeId = insertedEmployee.id;
      }

      const currentYear = new Date().getFullYear();
      const { count: existingBalanceCount } = await admin
        .from("leave_balances")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", resolvedEmployeeId)
        .eq("year", currentYear);

      if ((existingBalanceCount ?? 0) === 0) {
        await admin.from("leave_balances").insert([
          {
            employee_id: resolvedEmployeeId,
            leave_type: "vacation",
            year: currentYear,
            total_credits: 15,
            used_credits: 0,
          },
          {
            employee_id: resolvedEmployeeId,
            leave_type: "sick",
            year: currentYear,
            total_credits: 15,
            used_credits: 0,
          },
        ]);
      }
    }

    if (targetRole === "applicant") {
      const { error: employeeInactivateError } = await admin
        .from("employees")
        .update({
          employment_status: "terminated",
          end_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", userId);

      if (employeeInactivateError) {
        return {
          success: false,
          error: employeeInactivateError.message,
        };
      }
    }

    const targetRoute =
      targetRole === "employee"
        ? "/employee/dashboard"
        : targetRole === "hr_manager"
          ? "/hr"
          : "/applicant/dashboard";

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
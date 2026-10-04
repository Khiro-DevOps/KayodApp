"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export interface DevRoleToggleResult {
  success: boolean;
  newRole?: "applicant" | "employee";
  targetRoute?: string;
  error?: string;
}

export async function toggleDevUserRole(targetRoleOverride?: "applicant" | "employee"): Promise<DevRoleToggleResult> {
  // Restrict execution strictly to development environment
  if (process.env.NODE_ENV !== "development") {
    return {
      success: false,
      error: "Dev role toggle is strictly allowed in development mode only.",
    };
  }

  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const currentRole = profile?.role ?? user.user_metadata?.role ?? "candidate";

    // Determine target role: switch between applicant/candidate <-> employee
    const newRole: "applicant" | "employee" =
      targetRoleOverride ?? (["employee", "hr_manager", "admin"].includes(currentRole) ? "applicant" : "employee");

    const tenantId = profile?.tenant_id ?? user.user_metadata?.tenant_id ?? "00000000-0000-0000-0000-000000000001";

    // 1. Execute DB updates via Admin Client or RPC Function
    const { data: rpcData, error: rpcError } = await admin.rpc("dev_toggle_user_role", {
      target_user_id: user.id,
      target_tenant_id: tenantId,
      new_role: newRole,
    });

    // Fallback if RPC is not yet executed in Supabase instance
    if (rpcError) {
      if (newRole === "employee") {
        await admin
          .from("profiles")
          .update({ role: "employee", updated_at: new Date().toISOString() })
          .eq("id", user.id);

        const { data: emp } = await admin.from("employees").select("id").eq("profile_id", user.id).maybeSingle();

        if (emp) {
          await admin
            .from("employees")
            .update({ employment_status: "active", updated_at: new Date().toISOString() })
            .eq("id", emp.id);
        } else {
          await admin.from("employees").insert({
            tenant_id: tenantId,
            profile_id: user.id,
            employee_number: `EMP-${user.id.slice(0, 8)}`,
            job_title: "Staff Employee",
            employment_type: "full_time",
            employment_status: "active",
            start_date: new Date().toISOString().split("T")[0],
            base_salary: 30000.0,
            salary: 30000.0,
            pay_frequency: "monthly",
            currency: "PHP",
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        await admin
          .from("profiles")
          .update({ role: "candidate", updated_at: new Date().toISOString() })
          .eq("id", user.id);

        await admin
          .from("employees")
          .update({ employment_status: "separated", updated_at: new Date().toISOString() })
          .eq("profile_id", user.id);

        await admin
          .from("applications")
          .update({ status: "submitted", updated_at: new Date().toISOString() })
          .eq("candidate_id", user.id);
      }
    }

    // 2. Update Auth metadata role
    try {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          role: newRole === "employee" ? "employee" : "candidate",
        },
      });
    } catch (metaErr) {
      console.warn("Failed to update auth metadata in dev role toggle:", metaErr);
    }

    // 3. Revalidate path across all server components
    revalidatePath("/", "layout");

    const targetRoute = newRole === "employee" ? "/employee/dashboard" : "/applicant/jobs";

    return {
      success: true,
      newRole,
      targetRoute,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to toggle role";
    return { success: false, error: message };
  }
}

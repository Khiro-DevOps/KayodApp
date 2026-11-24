"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { ensureValidWorkLocationId } from "@/lib/employee-position-server";
import type { WorkSetup } from "@/lib/types";

export async function updateEmployeeLocationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;
  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) throw new Error("Forbidden: HR role required");

  const employeeId = formData.get("employee_id") as string;
  const workMode = formData.get("work_mode") as WorkSetup;
  const workLocationId = (formData.get("work_location_id") as string) || null;
  const rawDepartmentId = ((formData.get("department_id") as string) || "").trim();
  const newDepartmentName = ((formData.get("new_department_name") as string) || "").trim();

  let resolvedDepartmentId: string | null =
    rawDepartmentId && rawDepartmentId !== "__new__" ? rawDepartmentId : null;

  if (newDepartmentName) {
    const { data: existingDept } = await admin
      .from("departments")
      .select("id")
      .ilike("name", newDepartmentName)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingDept?.id) {
      resolvedDepartmentId = existingDept.id;
    } else {
      const { data: createdDept, error: deptErr } = await admin
        .from("departments")
        .insert({ name: newDepartmentName })
        .select("id")
        .single<{ id: string }>();
      if (deptErr) throw new Error(deptErr.message);
      resolvedDepartmentId = createdDept.id;
    }
  }

  const normalizedWorkMode =
    workMode === "wfh"
      ? "wfh"
      : workMode === "remote"
        ? "remote"
        : workMode === "hybrid"
          ? "hybrid"
          : "onsite";

  const resolvedBranchId =
    (normalizedWorkMode === "onsite" || normalizedWorkMode === "hybrid") && workLocationId
      ? await ensureValidWorkLocationId(workLocationId)
      : null;

  const { data: updatedEmp, error: empError } = await admin
    .from("employees")
    .update({
      work_mode: normalizedWorkMode,
      work_location_id: resolvedBranchId,
      department_id: resolvedDepartmentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId)
    .select("profile_id")
    .maybeSingle<{ profile_id: string | null }>();

  if (empError) throw new Error(empError.message);

  // Notify employee about the assigned office branch / work setup update
  if (updatedEmp?.profile_id) {
    let branchName: string | null = null;
    if (resolvedBranchId) {
      const { data: ob } = await admin
        .from("office_branches")
        .select("name")
        .eq("id", resolvedBranchId)
        .maybeSingle<{ name: string }>();
      if (ob?.name) {
        branchName = ob.name;
      } else {
        const { data: wl } = await admin
          .from("work_locations")
          .select("name")
          .eq("id", resolvedBranchId)
          .maybeSingle<{ name: string }>();
        branchName = wl?.name ?? null;
      }
    }

    const setupLabel =
      normalizedWorkMode === "wfh"
        ? "WFH"
        : normalizedWorkMode === "remote"
          ? "Remote"
          : normalizedWorkMode === "hybrid"
            ? "Hybrid"
            : "Onsite";

    const body = branchName
      ? `HR updated your Work Setup to ${setupLabel} and assigned your office branch to ${branchName}.`
      : `HR updated your Work Setup to ${setupLabel}.`;

    const { error: notifErr } = await admin.from("notifications").insert({
      recipient_id: updatedEmp.profile_id,
      sender_id: user.id,
      type: "schedule_published",
      title: "Work Setup & Office Branch Updated",
      body,
      action_url: "/employee/schedule",
    });

    if (notifErr) {
      console.error("updateEmployeeLocationAction notification error:", notifErr.message);
    }
  }

  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/employee/schedule");
  revalidatePath("/employee/profile");
  revalidatePath("/employee/dashboard");
}

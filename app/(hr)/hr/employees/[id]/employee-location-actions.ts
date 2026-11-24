"use server";

import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";
import { ensureValidWorkLocationId } from "@/lib/employee-position-server";
import type { WorkSetup } from "@/lib/types";

export async function updateEmployeeLocationAction(formData: FormData) {
  const ctx = await getHrSessionContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!canHr(ctx.hr_role, "workforce:manage", ctx.is_tenant_owner)) {
    throw new Error("Forbidden: insufficient HR permissions");
  }

  const admin = getAdminClient();

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
      sender_id: ctx.id,
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

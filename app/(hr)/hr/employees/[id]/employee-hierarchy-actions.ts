"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireHrPermission } from "@/lib/rbac/server";
import {
  normalizeJobLevel,
  requiresDirectReportsReassignment,
} from "@/lib/workforce-hierarchy";

export interface UpdateEmployeeHierarchyResult {
  ok: boolean;
  error?: string;
  requiresReassignmentWarning?: boolean;
  activeDirectReportsCount?: number;
}

const VALID_EMPLOYMENT_STATUSES = new Set([
  "active",
  "inactive",
  "onboarding",
  "on_leave",
  "suspended",
  "terminated",
  "separated",
]);

export async function updateEmployeeHierarchyAction(
  formData: FormData,
): Promise<UpdateEmployeeHierarchyResult> {
  const ctx = await requireHrPermission("workforce:manage");
  const admin = getAdminClient();

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const rawJobLevel = String(formData.get("job_level") ?? "staff").trim();
  const rawReportsTo = String(formData.get("reports_to") ?? "").trim();
  const rawStatus = String(formData.get("employment_status") ?? "active")
    .trim()
    .toLowerCase();
  const confirmReassignment =
    String(formData.get("confirm_reassignment") ?? "") === "true";

  if (!employeeId) {
    return { ok: false, error: "Employee ID is required." };
  }

  if (!VALID_EMPLOYMENT_STATUSES.has(rawStatus)) {
    return { ok: false, error: "Invalid employment status selected." };
  }

  const jobLevel = normalizeJobLevel(rawJobLevel);
  const reportsTo = rawReportsTo || null;

  if (reportsTo && reportsTo === employeeId) {
    return { ok: false, error: "An employee cannot report to themselves." };
  }

  const { data: targetEmployee, error: targetErr } = await admin
    .from("employees")
    .select("id, tenant_id, employment_status, end_date")
    .eq("id", employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      employment_status: string;
      end_date: string | null;
    }>();

  if (targetErr || !targetEmployee) {
    return { ok: false, error: targetErr?.message ?? "Employee not found." };
  }

  if (
    ctx.tenant_id &&
    targetEmployee.tenant_id &&
    ctx.tenant_id !== targetEmployee.tenant_id
  ) {
    return { ok: false, error: "Forbidden: employee belongs to another tenant." };
  }

  if (reportsTo) {
    const { data: supervisorRow, error: supErr } = await admin
      .from("employees")
      .select("id, tenant_id, employment_status")
      .eq("id", reportsTo)
      .maybeSingle<{
        id: string;
        tenant_id: string | null;
        employment_status: string;
      }>();

    if (supErr || !supervisorRow) {
      return { ok: false, error: "Selected supervisor was not found." };
    }

    if (supervisorRow.employment_status !== "active") {
      return {
        ok: false,
        error: "Reports To must be an active employee.",
      };
    }

    const effectiveTenantId = ctx.tenant_id ?? targetEmployee.tenant_id;
    if (
      effectiveTenantId &&
      supervisorRow.tenant_id &&
      supervisorRow.tenant_id !== effectiveTenantId
    ) {
      return {
        ok: false,
        error: "Reports To must belong to the same organization.",
      };
    }
  }

  const { count: activeDirectReportsCount, error: countErr } = await admin
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("reports_to", employeeId)
    .eq("employment_status", "active");

  if (countErr) {
    return { ok: false, error: countErr.message };
  }

  const directReportsCount = activeDirectReportsCount ?? 0;

  if (
    requiresDirectReportsReassignment(rawStatus, directReportsCount) &&
    !confirmReassignment
  ) {
    return {
      ok: false,
      requiresReassignmentWarning: true,
      activeDirectReportsCount: directReportsCount,
      error: `This employee still has ${directReportsCount} active direct report${
        directReportsCount === 1 ? "" : "s"
      }. Please reassign their direct reports before marking them ${rawStatus}.`,
    };
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    job_level: jobLevel,
    reports_to: reportsTo,
    employment_status: rawStatus,
    updated_at: nowIso,
  };

  if (rawStatus === "separated" || rawStatus === "terminated") {
    updatePayload.end_date =
      targetEmployee.end_date ?? nowIso.slice(0, 10);
  } else if (rawStatus === "active") {
    updatePayload.end_date = null;
  }

  const { error: updateErr } = await admin
    .from("employees")
    .update(updatePayload)
    .eq("id", employeeId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/employee/team");
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/profile");

  return { ok: true };
}

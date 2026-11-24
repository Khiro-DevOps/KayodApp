"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export interface SaveWorkModeOverrideResult {
  ok: boolean;
  error?: string;
}

export async function saveWorkModeOverrideAction(
  formData: FormData,
): Promise<SaveWorkModeOverrideResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const mode = String(formData.get("override_mode") ?? "")
    .trim()
    .toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!employeeId) {
    return { ok: false, error: "Employee ID is required." };
  }

  if (mode !== "onsite" && mode !== "wfh" && mode !== "clear") {
    return { ok: false, error: "Invalid work mode selection." };
  }

  if (mode !== "clear" && reason.length < 3) {
    return {
      ok: false,
      error: "Please enter a brief reason (at least 3 characters).",
    };
  }

  const admin = getAdminClient();

  const { data: supervisorEmployee } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!supervisorEmployee) {
    return { ok: false, error: "Active supervisor profile not found." };
  }

  const { data: targetEmployee } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile_id, reports_to, employment_status, profile:profiles!profile_id(first_name, last_name)",
    )
    .eq("id", employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      profile_id: string | null;
      reports_to: string | null;
      employment_status: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (!targetEmployee) {
    return { ok: false, error: "Direct report not found." };
  }

  if (
    targetEmployee.reports_to !== supervisorEmployee.id ||
    targetEmployee.employment_status !== "active"
  ) {
    return {
      ok: false,
      error: "Forbidden: you can only override work mode for your active direct reports.",
    };
  }

  const todayPht = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });

  if (mode === "clear") {
    const { error: deleteErr } = await admin
      .from("employee_work_mode_overrides")
      .delete()
      .eq("employee_id", employeeId)
      .eq("effective_date", todayPht);

    if (deleteErr) {
      return { ok: false, error: deleteErr.message };
    }

    revalidatePath("/employee/team");
    revalidatePath("/employee/schedule");
    revalidatePath("/employee/dashboard");
    return { ok: true };
  }

  const tenantId = targetEmployee.tenant_id ?? supervisorEmployee.tenant_id;
  if (!tenantId) {
    return { ok: false, error: "Tenant ID is missing for this employee." };
  }

  const { error: upsertErr } = await admin
    .from("employee_work_mode_overrides")
    .upsert(
      {
        tenant_id: tenantId,
        employee_id: employeeId,
        effective_date: todayPht,
        override_mode: mode,
        reason,
        approved_by_profile_id: user.id,
      },
      { onConflict: "employee_id,effective_date" },
    );

  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }

  const modeLabel = mode === "wfh" ? "WFH (Emergency)" : "Onsite (Emergency)";
  const empProfile = Array.isArray(targetEmployee.profile)
    ? targetEmployee.profile[0]
    : targetEmployee.profile;
  const empName =
    [empProfile?.first_name, empProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Direct Report";

  // Notify employee + tenant HR Admins/Generalists (best-effort)
  try {
    const notifications: Array<{
      recipient_id: string;
      sender_id: string;
      type: string;
      title: string;
      body: string;
      action_url: string;
    }> = [];

    if (targetEmployee.profile_id) {
      notifications.push({
        recipient_id: targetEmployee.profile_id,
        sender_id: user.id,
        type: "schedule_published",
        title: `Today's Work Mode Updated: ${modeLabel}`,
        body: `Your supervisor set today's (${todayPht}) work mode to ${modeLabel}. Reason: ${reason}`,
        action_url: "/employee/schedule",
      });
    }

    const { data: hrRecipients } = await admin
      .from("profiles")
      .select("id, hr_role, is_tenant_owner")
      .eq("tenant_id", tenantId)
      .in("role", ["hr_manager", "hr", "admin"]);

    for (const hr of hrRecipients ?? []) {
      const hrRow = hr as {
        id: string;
        hr_role?: string | null;
        is_tenant_owner?: boolean | null;
      };
      if (hrRow.id === user.id) continue;
      const effectiveHrRole = hrRow.hr_role ?? "hr_admin";
      if (
        hrRow.is_tenant_owner ||
        effectiveHrRole === "hr_admin" ||
        effectiveHrRole === "hr_generalist"
      ) {
        notifications.push({
          recipient_id: hrRow.id,
          sender_id: user.id,
          type: "schedule_published",
          title: `Supervisor Work Mode Override: ${empName}`,
          body: `${empName}'s work mode for ${todayPht} was overridden to ${modeLabel}. Reason: ${reason}`,
          action_url: `/hr/employees/${employeeId}`,
        });
      }
    }

    if (notifications.length > 0) {
      await admin.from("notifications").insert(notifications);
    }
  } catch (notifErr) {
    console.error("saveWorkModeOverrideAction notification error:", notifErr);
  }

  revalidatePath("/employee/team");
  revalidatePath("/employee/schedule");
  revalidatePath("/employee/dashboard");

  return { ok: true };
}

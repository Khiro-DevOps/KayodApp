"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { syncApprovedLeaveToSchedules } from "@/lib/leave-schedule-sync";
import { effectiveRole, isHRRole } from "@/lib/roles";
import {
  formatLeaveTypeDisplayLabel,
  isSpecialStatutoryLeave,
  POOL_DEDUCTIBLE_LEDGER_TYPES,
  toDbLeaveTypeEnum,
  toLedgerLeaveCode,
} from "@/lib/leave-policy";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const HR_ALLOWED_ROLES = ["hr", "hr_manager", "admin"];

function diffCalendarDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function isEmployeeProbationary(emp: {
  employment_status?: string | null;
  probation_end_date?: string | null;
}): boolean {
  const status = String(emp.employment_status ?? "").trim().toLowerCase();
  if (status === "probationary" || status === "onboarding") return true;
  if (emp.probation_end_date) {
    const todayPht = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    if (String(emp.probation_end_date).slice(0, 10) > todayPht) {
      return true;
    }
  }
  return false;
}

async function fetchTenantHrReviewers(
  admin: ReturnType<typeof getAdminClient>,
  tenantId: string | null,
  excludeProfileId: string
): Promise<Array<{ id: string }>> {
  let query = admin
    .from("profiles")
    .select("id, hr_role, is_tenant_owner")
    .in("role", HR_ALLOWED_ROLES);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data } = await query;
  const filtered = (data ?? []).filter((row) => {
    const hr = row as {
      id: string;
      hr_role?: string | null;
      is_tenant_owner?: boolean | null;
    };
    if (hr.id === excludeProfileId) return false;
    const effective = hr.hr_role ?? "hr_admin";
    return (
      Boolean(hr.is_tenant_owner) ||
      effective === "hr_admin" ||
      effective === "hr_generalist"
    );
  });

  if (filtered.length > 0) {
    return filtered.map((r) => ({ id: r.id }));
  }

  return (data ?? [])
    .filter((r) => r.id !== excludeProfileId)
    .map((r) => ({ id: r.id }));
}

export async function fileLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, tenant_id, reports_to, employment_status, probation_end_date")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      reports_to: string | null;
      employment_status: string | null;
      probation_end_date: string | null;
    }>();
  if (!employee) redirect("/employee/dashboard");

  let validTenantId: string | null = employee.tenant_id ?? null;
  if (validTenantId) {
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("id")
      .eq("id", validTenantId)
      .maybeSingle();
    if (!tenantRow) {
      validTenantId = null;
    }
  }

  const leaveType = String(formData.get("leave_type") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const reason = (formData.get("reason") as string | null)?.trim() || null;

  if (!leaveType || !startDate || !endDate) {
    redirect("/employee/leaves/new?error=All+fields+are+required");
  }

  if (new Date(`${endDate}T00:00:00Z`) < new Date(`${startDate}T00:00:00Z`)) {
    redirect("/employee/leaves/new?error=End+date+cannot+be+before+start+date");
  }

  const requestedDays = diffCalendarDaysInclusive(startDate, endDate);
  if (requestedDays <= 0 || Number.isNaN(requestedDays)) {
    redirect("/employee/leaves/new?error=Invalid+date+range");
  }

  // Overlap Protection: reject duplicate/overlapping against pending, pending_supervisor, pending_hr, or approved
  const { data: overlapping } = await admin
    .from("leave_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .in("status", ["pending", "pending_supervisor", "pending_hr", "approved"])
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    redirect(
      "/employee/leaves/new?error=You+already+have+an+overlapping+pending+or+approved+leave+request"
    );
  }

  const leaveYear = new Date(`${startDate}T00:00:00Z`).getFullYear();
  const dbLeaveType = toDbLeaveTypeEnum(leaveType);
  const ledgerType = toLedgerLeaveCode(leaveType);
  const displayLeaveLabel = formatLeaveTypeDisplayLabel(leaveType);
  const isSpecialStatutory = isSpecialStatutoryLeave(leaveType);
  const isPoolDeductible =
    ledgerType !== null && POOL_DEDUCTIBLE_LEDGER_TYPES.has(ledgerType);

  let ledgerRowToIncrement: {
    id: string;
    pending_days: number;
  } | null = null;

  // Balance & Eligibility Guardrails for VL, SL, SIL
  if (isPoolDeductible && ledgerType) {
    const { data: ledgerRow } = await admin
      .from("employee_leave_balances")
      .select("id, entitled_days, used_days, pending_days, eligibility, is_active")
      .eq("employee_id", employee.id)
      .eq("year", leaveYear)
      .eq("leave_type", ledgerType)
      .eq("is_active", true)
      .maybeSingle<{
        id: string;
        entitled_days: number;
        used_days: number;
        pending_days: number;
        eligibility: string;
        is_active: boolean;
      }>();

    if (ledgerRow) {
      if (
        ledgerRow.eligibility === "upon_regularization" &&
        isEmployeeProbationary(employee)
      ) {
        redirect(
          `/employee/leaves/new?error=${encodeURIComponent(
            `${ledgerType} leave credits become usable upon regularization. You are currently in your probationary period.`
          )}`
        );
      }

      const available =
        Number(ledgerRow.entitled_days ?? 0) -
        Number(ledgerRow.used_days ?? 0) -
        Number(ledgerRow.pending_days ?? 0);

      if (requestedDays > available) {
        redirect(
          `/employee/leaves/new?error=${encodeURIComponent(
            `Insufficient ${ledgerType} leave balance (${available} day${available === 1 ? "" : "s"} available, ${requestedDays} requested).`
          )}`
        );
      }

      ledgerRowToIncrement = {
        id: ledgerRow.id,
        pending_days: Number(ledgerRow.pending_days ?? 0),
      };
    } else if (dbLeaveType !== "unpaid") {
      // Fallback check against legacy leave_balances table if ledger not yet seeded
      const { data: legacyBalance } = await admin
        .from("leave_balances")
        .select("id, remaining")
        .eq("employee_id", employee.id)
        .eq("leave_type", dbLeaveType)
        .eq("year", leaveYear)
        .maybeSingle();

      if (
        legacyBalance &&
        typeof legacyBalance.remaining === "number" &&
        legacyBalance.remaining < requestedDays
      ) {
        redirect(
          `/employee/leaves/new?error=${encodeURIComponent(
            `Insufficient ${displayLeaveLabel} balance (${legacyBalance.remaining} remaining, ${requestedDays} requested).`
          )}`
        );
      }
    }
  }

  // Two-stage routing: pending_supervisor if reports_to exists, else pending_hr
  const hasSupervisor = Boolean(employee.reports_to);
  const initialStatus = hasSupervisor ? "pending_supervisor" : "pending_hr";

  let { error: insertError } = await admin.from("leave_requests").insert({
    employee_id: employee.id,
    leave_type: dbLeaveType,
    start_date: startDate,
    end_date: endDate,
    reason,
    status: initialStatus,
    supervisor_id: employee.reports_to ?? null,
    requires_document_verification: isSpecialStatutory,
  });

  // Graceful fallback to 'pending' only if a legacy enum constraint blocks 'pending_supervisor'/'pending_hr'
  if (
    insertError &&
    /invalid input value for enum|check constraint/i.test(insertError.message)
  ) {
    const fallbackRes = await admin.from("leave_requests").insert({
      employee_id: employee.id,
      leave_type: dbLeaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: "pending",
      supervisor_id: employee.reports_to ?? null,
      requires_document_verification: isSpecialStatutory,
    });
    insertError = fallbackRes.error;
  }

  if (insertError) {
    redirect(`/employee/leaves/new?error=${encodeURIComponent(insertError.message)}`);
  }

  // Increment pending_days in employee_leave_balances for VL/SL/SIL
  if (ledgerRowToIncrement) {
    await admin
      .from("employee_leave_balances")
      .update({
        pending_days: ledgerRowToIncrement.pending_days + requestedDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledgerRowToIncrement.id);
  }

  // Notify Supervisor (Stage 1) or Tenant HR (Stage 2 when reports_to is null)
  try {
    const { data: requesterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const requesterName =
      [requesterProfile?.first_name, requesterProfile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "An employee";

    if (hasSupervisor && employee.reports_to) {
      const { data: supRow } = await admin
        .from("employees")
        .select("profile_id")
        .eq("id", employee.reports_to)
        .maybeSingle<{ profile_id: string | null }>();

      if (supRow?.profile_id && supRow.profile_id !== user.id) {
        await sendNotification({
          recipientId: supRow.profile_id,
          senderId: user.id,
          type: "general",
          title: "Team Leave Request Pending Your Review",
          body: `${requesterName} filed a ${leaveType} leave request (${startDate} to ${endDate}, ${requestedDays}d). Review and forward to HR.`,
          actionUrl: "/employee/team",
          actionName: "fileLeaveRequest",
        });
      }
    } else {
      const hrUsers = await fetchTenantHrReviewers(admin, validTenantId, user.id);
      await Promise.all(
        hrUsers.map((hr) =>
          sendNotification({
            recipientId: hr.id,
            senderId: user.id,
            type: "general",
            title: isSpecialStatutory
              ? "New Statutory Leave Request (Document Verification)"
              : "New Leave Request Pending HR Approval",
            body: `${requesterName} filed a ${leaveType} leave request (${startDate} to ${endDate}).`,
            actionUrl: "/hr/leaves",
            actionName: "fileLeaveRequest",
          })
        )
      );
    }
  } catch (notifyError) {
    console.error("fileLeaveRequest: notification error:", notifyError);
  }

  revalidatePath("/employee/leaves");
  revalidatePath("/employee/team");
  revalidatePath("/hr/leaves");
  revalidatePath("/employee/dashboard");
  redirect(
    `/employee/leaves?success=${encodeURIComponent(
      hasSupervisor
        ? "Leave request submitted to your supervisor for initial approval"
        : "Leave request submitted to HR for approval"
    )}`
  );
}

export async function reviewLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getAdminClient();
  const rawMetadata = (
    (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    redirect("/employee/dashboard");
  }

  const leaveId = String(formData.get("leave_id") ?? "").trim();
  const action = formData.get("action") as "approved" | "rejected";
  const remarks = (formData.get("hr_remarks") as string | null)?.trim() || null;

  if (!leaveId || !["approved", "rejected"].includes(action)) redirect("/hr/leaves");

  const { data: leave } = await admin
    .from("leave_requests")
    .select(
      "id, employee_id, supervisor_id, leave_type, total_days, start_date, end_date, status"
    )
    .eq("id", leaveId)
    .maybeSingle();

  const { data: leaveEmp } = leave?.employee_id
    ? await admin
        .from("employees")
        .select("profile_id, reports_to, profile:profiles!profile_id(first_name, last_name)")
        .eq("id", leave.employee_id)
        .maybeSingle<{
          profile_id: string | null;
          reports_to: string | null;
          profile?:
            | { first_name?: string | null; last_name?: string | null }
            | Array<{ first_name?: string | null; last_name?: string | null }>
            | null;
        }>()
    : { data: null };

  const nowIso = new Date().toISOString();

  // Update the leave request status + HR audit fields
  const { error } = await admin
    .from("leave_requests")
    .update({
      status: action,
      hr_remarks: remarks,
      hr_reviewer_id: user.id,
      hr_action_at: nowIso,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", leaveId);

  if (error) redirect(`/hr/leaves?error=${encodeURIComponent(error.message)}`);

  // Reconcile employee_leave_balances (convert pending_days -> used_days on approved; release pending_days on rejected)
  if (leave && leave.employee_id) {
    const daysCount =
      typeof leave.total_days === "number" && leave.total_days > 0
        ? leave.total_days
        : leave.start_date && leave.end_date
          ? diffCalendarDaysInclusive(leave.start_date, leave.end_date)
          : 0;
    const year = leave.start_date
      ? new Date(`${leave.start_date}T00:00:00Z`).getFullYear()
      : new Date().getFullYear();
    const ledgerType = toLedgerLeaveCode(leave.leave_type ?? "");
    const dbLeaveType = toDbLeaveTypeEnum(leave.leave_type ?? "");

    if (
      ledgerType &&
      POOL_DEDUCTIBLE_LEDGER_TYPES.has(ledgerType) &&
      daysCount > 0
    ) {
      const { data: ledgerRow } = await admin
        .from("employee_leave_balances")
        .select("id, used_days, pending_days")
        .eq("employee_id", leave.employee_id)
        .eq("year", year)
        .eq("leave_type", ledgerType)
        .maybeSingle<{ id: string; used_days: number; pending_days: number }>();

      if (ledgerRow) {
        const nextPending = Math.max(0, Number(ledgerRow.pending_days ?? 0) - daysCount);
        const nextUsed =
          action === "approved"
            ? Number(ledgerRow.used_days ?? 0) + daysCount
            : Number(ledgerRow.used_days ?? 0);

        await admin
          .from("employee_leave_balances")
          .update({
            used_days: nextUsed,
            pending_days: nextPending,
            updated_at: nowIso,
          })
          .eq("id", ledgerRow.id);
      }
    }

    // Legacy leave_balances best-effort sync
    if (action === "approved" && dbLeaveType !== "unpaid") {
      const { data: balance } = await admin
        .from("leave_balances")
        .select("id, used_credits")
        .eq("employee_id", leave.employee_id)
        .eq("leave_type", dbLeaveType)
        .eq("year", year)
        .maybeSingle();

      if (balance) {
        await admin
          .from("leave_balances")
          .update({
            used_credits: (balance.used_credits ?? 0) + daysCount,
            updated_at: nowIso,
          })
          .eq("id", balance.id);
      }
    }

    // Notify both Staff and Team Lead (Direct Supervisor) of final HR decision
    if (leaveEmp?.profile_id) {
      await sendNotification({
        recipientId: leaveEmp.profile_id,
        senderId: user.id,
        type: "leave_status_changed",
        title: action === "approved" ? "Leave Request Approved" : "Leave Request Rejected",
        body:
          action === "approved"
            ? `Your ${formatLeaveTypeDisplayLabel(leave.leave_type ?? "")} (${leave.start_date} to ${leave.end_date}) has been approved by HR.${remarks ? ` Remarks: ${remarks}` : ""}`
            : `Your ${formatLeaveTypeDisplayLabel(leave.leave_type ?? "")} (${leave.start_date} to ${leave.end_date}) was rejected by HR.${remarks ? ` Reason: ${remarks}` : ""}`,
        actionUrl: "/employee/leaves",
        actionName: "reviewLeaveRequest",
      });
    }

    const supervisorEmpId =
      (leave as { supervisor_id?: string | null }).supervisor_id ??
      leaveEmp?.reports_to ??
      null;
    if (supervisorEmpId) {
      const { data: supEmp } = await admin
        .from("employees")
        .select("profile_id")
        .eq("id", supervisorEmpId)
        .maybeSingle<{ profile_id: string | null }>();

      if (supEmp?.profile_id && supEmp.profile_id !== leaveEmp?.profile_id) {
        const empProf = Array.isArray(leaveEmp?.profile)
          ? leaveEmp?.profile[0]
          : leaveEmp?.profile;
        const empName =
          [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
          "Your direct report";
        await sendNotification({
          recipientId: supEmp.profile_id,
          senderId: user.id,
          type: "leave_status_changed",
          title:
            action === "approved"
              ? "Team Leave Approved by HR"
              : "Team Leave Rejected by HR",
          body:
            action === "approved"
              ? `${empName}'s ${formatLeaveTypeDisplayLabel(leave.leave_type ?? "")} (${leave.start_date} to ${leave.end_date}) was approved by HR.${remarks ? ` Remarks: ${remarks}` : ""}`
              : `${empName}'s ${formatLeaveTypeDisplayLabel(leave.leave_type ?? "")} (${leave.start_date} to ${leave.end_date}) was rejected by HR.${remarks ? ` Reason: ${remarks}` : ""}`,
          actionUrl: "/employee/team",
          actionName: "reviewLeaveRequest",
        });
      }
    }
  }

  if (action === "approved" && leave?.employee_id && leave.start_date && leave.end_date) {
    await syncApprovedLeaveToSchedules({
      employeeId: leave.employee_id,
      startDate: leave.start_date,
      endDate: leave.end_date,
      leaveType: leave.leave_type ?? "leave",
      reviewedBy: user.id,
    });
  }

  revalidatePath("/hr/leaves");
  revalidatePath("/employee/leaves");
  revalidatePath("/employee/team");
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/schedules");
  redirect("/hr/leaves");
}

export async function cancelLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!employee) redirect("/employee/dashboard");

  const leaveId = String(formData.get("leave_id") ?? "").trim();
  if (!leaveId) redirect("/employee/leaves");

  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, total_days, status")
    .eq("id", leaveId)
    .eq("employee_id", employee.id)
    .in("status", ["pending", "pending_supervisor", "pending_hr"])
    .maybeSingle();

  if (!leave) redirect("/employee/leaves");

  const nowIso = new Date().toISOString();
  const { error: cancelErr } = await admin
    .from("leave_requests")
    .update({
      status: "cancelled",
      updated_at: nowIso,
    })
    .eq("id", leaveId)
    .eq("employee_id", employee.id);

  if (!cancelErr) {
    // Release pending_days from employee_leave_balances
    const daysCount =
      typeof leave.total_days === "number" && leave.total_days > 0
        ? leave.total_days
        : leave.start_date && leave.end_date
          ? diffCalendarDaysInclusive(leave.start_date, leave.end_date)
          : 0;
    const year = leave.start_date
      ? new Date(`${leave.start_date}T00:00:00Z`).getFullYear()
      : new Date().getFullYear();
    const ledgerType = toLedgerLeaveCode(leave.leave_type ?? "");
    const dbLeaveType = toDbLeaveTypeEnum(leave.leave_type ?? "");

    if (
      ledgerType &&
      POOL_DEDUCTIBLE_LEDGER_TYPES.has(ledgerType) &&
      daysCount > 0
    ) {
      const { data: ledgerRow } = await admin
        .from("employee_leave_balances")
        .select("id, pending_days")
        .eq("employee_id", employee.id)
        .eq("year", year)
        .eq("leave_type", ledgerType)
        .maybeSingle<{ id: string; pending_days: number }>();

      if (ledgerRow) {
        await admin
          .from("employee_leave_balances")
          .update({
            pending_days: Math.max(0, Number(ledgerRow.pending_days ?? 0) - daysCount),
            updated_at: nowIso,
          })
          .eq("id", ledgerRow.id);
      }
    }
  }

  revalidatePath("/employee/leaves");
  revalidatePath("/employee/team");
  revalidatePath("/hr/leaves");
  revalidatePath("/employee/dashboard");
  redirect("/employee/leaves");
}

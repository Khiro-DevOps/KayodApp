import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncApprovedLeaveToSchedules } from "@/lib/leave-schedule-sync";
import {
  POOL_DEDUCTIBLE_LEDGER_TYPES,
  toDbLeaveTypeEnum,
  toLedgerLeaveCode,
} from "@/lib/leave-policy";
import { sendNotification } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const HR_ALLOWED_ROLES = ["hr", "hr_manager", "admin"];

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is HR
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !HR_ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Only HR can approve/reject leave requests" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const leaveId = String(formData.get("leave_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();

  if (!leaveId || !["approved", "rejected"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid leave_id or action" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  const { data: leave } = await admin
    .from("leave_requests")
    .select("id, employee_id, supervisor_id, total_days, leave_type, start_date, end_date")
    .eq("id", leaveId)
    .maybeSingle();

  // Update leave request status + Phase 2 HR audit columns
  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("leave_requests")
    .update({
      status: action,
      hr_reviewer_id: user.id,
      hr_action_at: nowIso,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", leaveId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update leave request: ${updateError.message}` },
      { status: 500 }
    );
  }

  // Reconcile employee_leave_balances & notify both Staff and Team Lead
  if (leave && leave.employee_id) {
    const year = leave.start_date
      ? new Date(`${leave.start_date}T00:00:00Z`).getFullYear()
      : new Date().getFullYear();
    const daysCount = Number(leave.total_days ?? 0);
    const ledgerType = toLedgerLeaveCode(leave.leave_type ?? "");
    const dbLeaveType = toDbLeaveTypeEnum(leave.leave_type ?? "");

    if (ledgerType && POOL_DEDUCTIBLE_LEDGER_TYPES.has(ledgerType) && daysCount > 0) {
      const { data: ledgerRow } = await admin
        .from("employee_leave_balances")
        .select("id, used_days, pending_days")
        .eq("employee_id", leave.employee_id)
        .eq("year", year)
        .eq("leave_type", ledgerType)
        .maybeSingle<{ id: string; used_days: number; pending_days: number }>();

      if (ledgerRow) {
        await admin
          .from("employee_leave_balances")
          .update({
            used_days:
              action === "approved"
                ? Number(ledgerRow.used_days ?? 0) + daysCount
                : Number(ledgerRow.used_days ?? 0),
            pending_days: Math.max(0, Number(ledgerRow.pending_days ?? 0) - daysCount),
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

    // Notify both Staff and Team Lead
    const { data: empRow } = await admin
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
      }>();

    if (empRow?.profile_id) {
      await sendNotification({
        recipientId: empRow.profile_id,
        senderId: user.id,
        type: "leave_status_changed",
        title: action === "approved" ? "Leave Request Approved" : "Leave Request Rejected",
        body: `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was ${action} by HR.`,
        actionUrl: "/employee/leaves",
        actionName: "approveLeaveApi",
      });
    }

    const supervisorEmpId =
      (leave as { supervisor_id?: string | null }).supervisor_id ?? empRow?.reports_to ?? null;
    if (supervisorEmpId) {
      const { data: supRow } = await admin
        .from("employees")
        .select("profile_id")
        .eq("id", supervisorEmpId)
        .maybeSingle<{ profile_id: string | null }>();

      if (supRow?.profile_id && supRow.profile_id !== empRow?.profile_id) {
        const empProf = Array.isArray(empRow?.profile)
          ? empRow?.profile[0]
          : empRow?.profile;
        const empName =
          [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ").trim() ||
          "Your direct report";
        await sendNotification({
          recipientId: supRow.profile_id,
          senderId: user.id,
          type: "leave_status_changed",
          title: action === "approved" ? "Team Leave Approved by HR" : "Team Leave Rejected by HR",
          body: `${empName}'s ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) was ${action} by HR.`,
          actionUrl: "/employee/team",
          actionName: "approveLeaveApi",
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
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/schedules");

  return NextResponse.json(
    { message: `Leave request ${action}` },
    { status: 200 }
  );
}

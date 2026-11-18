"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { syncApprovedLeaveToSchedules } from "@/lib/leave-schedule-sync";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const HR_ALLOWED_ROLES = ["hr", "hr_manager", "admin"];

function diffCalendarDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export async function fileLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .single();
  if (!employee) redirect("/employee/dashboard");

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

  // Reject overlapping pending or approved leave requests for the same employee
  const { data: overlapping } = await supabase
    .from("leave_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    redirect("/employee/leaves/new?error=You+already+have+an+overlapping+pending+or+approved+leave+request");
  }

  // Validate leave balance when leave_type !== "unpaid"
  if (leaveType !== "unpaid") {
    const leaveYear = new Date(`${startDate}T00:00:00Z`).getFullYear();
    const { data: balance } = await supabase
      .from("leave_balances")
      .select("id, remaining")
      .eq("employee_id", employee.id)
      .eq("leave_type", leaveType)
      .eq("year", leaveYear)
      .maybeSingle();

    if (balance && typeof balance.remaining === "number" && balance.remaining < requestedDays) {
      redirect(
        `/employee/leaves/new?error=${encodeURIComponent(
          `Insufficient ${leaveType} leave balance (${balance.remaining} remaining, ${requestedDays} requested).`
        )}`
      );
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: employee.id,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    reason,
    status: "pending",
  });

  if (error) redirect(`/employee/leaves/new?error=${encodeURIComponent(error.message)}`);

  // Notify HR managers/admins in the tenant
  try {
    const admin = getAdminClient();
    const { data: requesterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const requesterName =
      [requesterProfile?.first_name, requesterProfile?.last_name].filter(Boolean).join(" ").trim() ||
      "An employee";

    let hrQuery = admin
      .from("profiles")
      .select("id")
      .in("role", HR_ALLOWED_ROLES);
    if (employee.tenant_id) {
      hrQuery = hrQuery.eq("tenant_id", employee.tenant_id);
    }
    const { data: hrUsers } = await hrQuery;

    await Promise.all(
      (hrUsers ?? [])
        .filter((hr) => hr.id !== user.id)
        .map((hr) =>
          sendNotification({
            recipientId: hr.id,
            senderId: user.id,
            type: "general",
            title: "New Leave Request",
            body: `${requesterName} filed a ${leaveType} leave request (${startDate} to ${endDate}).`,
            actionUrl: "/hr/leaves",
            actionName: "fileLeaveRequest",
          })
        )
    );
  } catch (notifyError) {
    console.error("fileLeaveRequest: failed to notify HR:", notifyError);
  }

  revalidatePath("/employee/leaves");
  revalidatePath("/hr/leaves");
  revalidatePath("/employee/dashboard");
  redirect("/employee/leaves?success=Leave+request+submitted");
}

export async function reviewLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !HR_ALLOWED_ROLES.includes(profile.role)) {
    redirect("/employee/dashboard");
  }

  const leaveId = String(formData.get("leave_id") ?? "").trim();
  const action = formData.get("action") as "approved" | "rejected";
  const remarks = (formData.get("hr_remarks") as string | null)?.trim() || null;

  if (!leaveId || !["approved", "rejected"].includes(action)) redirect("/hr/leaves");

  const { data: leave } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type, total_days, start_date, end_date, employees(profile_id)")
    .eq("id", leaveId)
    .single();

  // Update the leave request status
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: action,
      hr_remarks: remarks,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leaveId);

  if (error) redirect(`/hr/leaves?error=${encodeURIComponent(error.message)}`);

  // If approved and not unpaid, increment used_credits (remaining is generated)
  if (action === "approved" && leave && leave.leave_type !== "unpaid") {
    const year = leave.start_date
      ? new Date(`${leave.start_date}T00:00:00Z`).getFullYear()
      : new Date().getFullYear();

    const { data: balance } = await supabase
      .from("leave_balances")
      .select("id, used_credits")
      .eq("employee_id", leave.employee_id)
      .eq("leave_type", leave.leave_type)
      .eq("year", year)
      .maybeSingle();

    if (balance) {
      await supabase
        .from("leave_balances")
        .update({
          used_credits: (balance.used_credits ?? 0) + (leave.total_days ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", balance.id);
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

  // Notify employee
  const empRelation = Array.isArray(leave?.employees) ? leave?.employees[0] : leave?.employees;
  const recipientId = empRelation?.profile_id;
  if (recipientId) {
    await sendNotification({
      recipientId,
      senderId: user.id,
      type: "leave_status_changed",
      title: action === "approved" ? "Leave Request Approved" : "Leave Request Rejected",
      body: `Your ${leave?.leave_type ?? ""} leave request (${leave?.start_date ?? ""} to ${leave?.end_date ?? ""}) was ${action}.${remarks ? ` Remarks: ${remarks}` : ""}`,
      actionUrl: "/employee/leaves",
      actionName: "reviewLeaveRequest",
    });
  }

  revalidatePath("/hr/leaves");
  revalidatePath("/employee/leaves");
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/schedule");
  revalidatePath("/hr/schedules");
  redirect("/hr/leaves");
}

export async function cancelLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .single();
  if (!employee) redirect("/employee/dashboard");

  const leaveId = String(formData.get("leave_id") ?? "").trim();
  if (!leaveId) redirect("/employee/leaves");

  // Only allow cancelling own pending requests
  await supabase
    .from("leave_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leaveId)
    .eq("employee_id", employee.id)
    .eq("status", "pending");

  revalidatePath("/employee/leaves");
  revalidatePath("/hr/leaves");
  revalidatePath("/employee/dashboard");
  redirect("/employee/leaves");
}
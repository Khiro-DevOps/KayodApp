import { createClient } from "@/lib/supabase/server";
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

  const { data: leave } = await supabase
    .from("leave_requests")
    .select("id, employee_id, total_days, leave_type, start_date, end_date, employees(profile_id)")
    .eq("id", leaveId)
    .single();

  // Update leave request status
  const { error: updateError } = await supabase
    .from("leave_requests")
    .update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leaveId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update leave request: ${updateError.message}` },
      { status: 500 }
    );
  }

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

  // Notify employee
  const empRelation = Array.isArray(leave?.employees) ? leave?.employees[0] : leave?.employees;
  const recipientId = empRelation?.profile_id;
  if (recipientId) {
    await sendNotification({
      recipientId,
      senderId: user.id,
      type: "leave_status_changed",
      title: action === "approved" ? "Leave Request Approved" : "Leave Request Rejected",
      body: `Your ${leave?.leave_type ?? ""} leave request (${leave?.start_date ?? ""} to ${leave?.end_date ?? ""}) was ${action}.`,
      actionUrl: "/employee/leaves",
      actionName: "apiLeavesApprove",
    });
  }

  revalidatePath("/hr/leaves");
  revalidatePath("/employee/leaves");

  return NextResponse.json(
    { message: `Leave request ${action}` },
    { status: 200 }
  );
}

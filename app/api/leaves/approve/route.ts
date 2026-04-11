import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only HR can approve/reject leave requests" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const leaveId = formData.get("leave_id") as string;
  const action = formData.get("action") as string;

  if (!leaveId || !["approved", "rejected"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid leave_id or action" },
      { status: 400 }
    );
  }

  // Update leave request status
  const { error: updateError } = await supabase
    .from("leave_requests")
    .update({ status: action })
    .eq("id", leaveId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update leave request: ${updateError.message}` },
      { status: 500 }
    );
  }

  // If approved, update leave balance
  if (action === "approved") {
    const { data: leave } = await supabase
      .from("leave_requests")
      .select("employee_id, total_days, leave_type")
      .eq("id", leaveId)
      .single();

    if (leave) {
      // Deduct from leave balance
      await supabase
        .from("leave_balances")
        .update({
          remaining: supabase.rpc("decrement_leave_balance", {
            p_employee_id: leave.employee_id,
            p_leave_type: leave.leave_type,
            p_days: leave.total_days,
          }),
        })
        .eq("employee_id", leave.employee_id)
        .eq("leave_type", leave.leave_type);
    }
  }

  return NextResponse.json(
    { message: `Leave request ${action}` },
    { status: 200 }
  );
}

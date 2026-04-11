"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function fileLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees").select("id").eq("profile_id", user.id).single();
  if (!employee) redirect("/dashboard");

  const leaveType = formData.get("leave_type") as string;
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date") as string;
  const reason    = formData.get("reason") as string | null;

  if (!leaveType || !startDate || !endDate) redirect("/leaves/new");

  if (new Date(endDate) < new Date(startDate)) {
    redirect("/leaves/new?error=End date cannot be before start date");
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: employee.id,
    leave_type:  leaveType,
    start_date:  startDate,
    end_date:    endDate,
    reason:      reason || null,
    status:      "pending",
  });

  if (error) redirect(`/leaves/new?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/leaves");
  revalidatePath("/dashboard");
  redirect("/leaves?success=Leave request filed successfully");
}

export async function reviewLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const leaveId  = formData.get("leave_id") as string;
  const action   = formData.get("action") as "approved" | "rejected";
  const remarks  = formData.get("hr_remarks") as string | null;

  if (!leaveId || !action) redirect("/leaves");

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status:      action,
      hr_remarks:  remarks || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", leaveId);

  if (error) redirect(`/leaves?error=${encodeURIComponent(error.message)}`);

  // Update leave balance if approved
  if (action === "approved") {
    const { data: leave } = await supabase
      .from("leave_requests")
      .select("employee_id, leave_type, total_days")
      .eq("id", leaveId)
      .single();

    if (leave) {
      const year = new Date().getFullYear();
      await supabase
        .from("leave_balances")
        .update({
          used_credits: supabase.rpc("increment", {
            table_name: "leave_balances",
            column_name: "used_credits",
            amount: leave.total_days,
          }) as unknown as number,
        })
        .eq("employee_id", leave.employee_id)
        .eq("leave_type", leave.leave_type)
        .eq("year", year);
    }
  }

  // Notification auto-fired by DB trigger

  revalidatePath("/leaves");
  revalidatePath("/dashboard");
  redirect("/leaves");
}

export async function cancelLeaveRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const leaveId = formData.get("leave_id") as string;
  if (!leaveId) redirect("/leaves");

  const { data: employee } = await supabase
    .from("employees").select("id").eq("profile_id", user.id).single();
  if (!employee) redirect("/dashboard");

  await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", leaveId)
    .eq("employee_id", employee.id)
    .eq("status", "pending");

  revalidatePath("/leaves");
  redirect("/leaves");
}

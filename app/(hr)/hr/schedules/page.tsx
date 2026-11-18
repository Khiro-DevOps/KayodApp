import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HRSchedulesClient, { type HRScheduleEmployee } from "./hr-schedules-client";

export const metadata = {
  title: "Schedules & Work Models | Kayod HR",
  description: "Manage employee shifts, onsite days, and hybrid arrangements",
};

export default async function HRSchedulesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "hr_manager" && profile.role !== "admin" && profile.role !== "hr")) {
    redirect("/login");
  }

  const [{ data: employees }, { count: pendingLeaveCount }] = await Promise.all([
    supabase
      .from("employees")
      .select(`
        *,
        profiles (
          first_name,
          last_name
        )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  monday.setHours(0, 0, 0, 0);
  const weekIsoDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const weekStartStr = weekIsoDates[0];
  const weekEndStr = weekIsoDates[6];

  const activeEmployeeIds = (employees ?? []).map((emp) => emp.id);

  const leaveDaysByEmp = new Map<string, number[]>();
  if (activeEmployeeIds.length > 0) {
    const { data: approvedLeaves } = await supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .in("employee_id", activeEmployeeIds)
      .eq("status", "approved")
      .lte("start_date", weekEndStr)
      .gte("end_date", weekStartStr);

    for (const lr of approvedLeaves ?? []) {
      const indices = leaveDaysByEmp.get(lr.employee_id) ?? [];
      weekIsoDates.forEach((iso, idx) => {
        if (lr.start_date <= iso && lr.end_date >= iso && !indices.includes(idx)) {
          indices.push(idx);
        }
      });
      leaveDaysByEmp.set(lr.employee_id, indices);
    }
  }

  type RawEmployeeRow = {
    id: string;
    job_title: string | null;
    work_mode: string | null;
    hybrid_onsite_days: string[] | null;
    shift_start: string | null;
    shift_end: string | null;
    employment_status: string | null;
    profiles: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
  };

  const formattedEmployees: HRScheduleEmployee[] = ((employees ?? []) as RawEmployeeRow[])
    .map((emp) => {
      const p = Array.isArray(emp.profiles) ? emp.profiles[0] ?? null : emp.profiles;
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";
      const rawModel = (emp.work_mode === "remote" ? "wfh" : emp.work_mode) || "onsite";

      return {
        id: emp.id,
        name,
        role: emp.job_title || "Staff",
        work_model: rawModel as HRScheduleEmployee["work_model"],
        hybrid_onsite_days: Array.isArray(emp.hybrid_onsite_days)
          ? emp.hybrid_onsite_days
          : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        shift_start: emp.shift_start || "09:00",
        shift_end: emp.shift_end || "18:00",
        leave_days: leaveDaysByEmp.get(emp.id) ?? [],
      };
    });

  const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return (
    <HRSchedulesClient
      initialEmployees={formattedEmployees}
      todayDayName={todayDayName}
      pendingLeaveCount={pendingLeaveCount ?? 0}
    />
  );
}

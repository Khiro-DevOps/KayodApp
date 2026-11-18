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

  if (!profile || (profile.role !== "hr_manager" && profile.role !== "admin")) {
    redirect("/login");
  }

  let employeesQuery = supabase
    .from("employees")
    .select(`
      id,
      job_title,
      work_model,
      work_mode,
      hybrid_onsite_days,
      shift_start,
      shift_end,
      employment_status,
      tenant_id,
      profiles (
        first_name,
        last_name
      )
    `);

  if (profile.tenant_id) {
    employeesQuery = employeesQuery.or(`tenant_id.eq.${profile.tenant_id},tenant_id.is.null`);
  }

  const { data: employees } = await employeesQuery.order("created_at", { ascending: false });

  const allowedStatuses = new Set(["active", "probation", "onboarding"]);

  const formattedEmployees: HRScheduleEmployee[] = (employees ?? [])
    .filter((emp: any) =>
      allowedStatuses.has(String(emp.employment_status ?? "active").toLowerCase())
    )
    .map((emp: any) => {
      const p = emp.profiles as { first_name?: string; last_name?: string } | null;
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";
      const rawModel = emp.work_model || (emp.work_mode === "remote" ? "wfh" : emp.work_mode) || "onsite";

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
      };
    });

  const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return <HRSchedulesClient initialEmployees={formattedEmployees} todayDayName={todayDayName} />;
}

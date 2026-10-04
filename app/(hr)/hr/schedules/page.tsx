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
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "hr_manager" && profile.role !== "admin")) {
    redirect("/login");
  }

  const { data: employees } = await supabase
    .from("employees")
    .select(`
      id,
      job_title,
      work_model,
      hybrid_onsite_days,
      shift_start,
      shift_end,
      profiles (
        first_name,
        last_name
      )
    `)
    .eq("employment_status", "active");

  const formattedEmployees: HRScheduleEmployee[] = (employees ?? []).map((emp: any) => {
    const p = emp.profiles as { first_name?: string; last_name?: string } | null;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";

    return {
      id: emp.id,
      name,
      role: emp.job_title || "Staff",
      work_model: (emp.work_model as any) || "onsite",
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

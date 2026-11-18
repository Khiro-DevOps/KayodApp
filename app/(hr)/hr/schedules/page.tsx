import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
import HRSchedulesClient, { type HRScheduleEmployee } from "./hr-schedules-client";
import {
  DAYS_FULL,
  getPhtDayInfo,
  normalizeDaysToFull,
  parseHybridScheduleNotes,
} from "@/lib/hybrid-schedule";

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

  const admin = getAdminClient();
  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await admin
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    redirect("/login");
  }

  const [{ data: initialEmployees, error: empError }, { count: pendingLeaveCount }] = await Promise.all([
    admin
      .from("employees")
      .select("*")
      .order("created_at", { ascending: false }),
    admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  let employees = initialEmployees;
  if (empError) {
    const fallback = await admin.from("employees").select("*");
    employees = fallback.data;
  }

  const profileIds = Array.from(
    new Set(
      (employees ?? [])
        .map((e) => (e as { profile_id?: string | null }).profile_id)
        .filter((pid): pid is string => Boolean(pid))
    )
  );
  const profileMap = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  if (profileIds.length > 0) {
    const { data: profRows } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", profileIds);
    for (const p of profRows ?? []) {
      profileMap.set(p.id, p);
    }
  }

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
  const hybridScheduleByEmp = new Map<
    string,
    { onsiteDays: string[]; wfhDays: string[]; cleanNotes: string }
  >();
  if (activeEmployeeIds.length > 0) {
    const [{ data: approvedLeaves }, { data: publishedSchedules }] = await Promise.all([
      admin
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .in("employee_id", activeEmployeeIds)
        .eq("status", "approved")
        .lte("start_date", weekEndStr)
        .gte("end_date", weekStartStr),
      admin
        .from("schedules")
        .select("employee_id, week_start, notes, updated_at")
        .in("employee_id", activeEmployeeIds)
        .eq("is_published", true)
        .order("week_start", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

    for (const lr of approvedLeaves ?? []) {
      const indices = leaveDaysByEmp.get(lr.employee_id) ?? [];
      weekIsoDates.forEach((iso, idx) => {
        if (lr.start_date <= iso && lr.end_date >= iso && !indices.includes(idx)) {
          indices.push(idx);
        }
      });
      leaveDaysByEmp.set(lr.employee_id, indices);
    }

    for (const sched of publishedSchedules ?? []) {
      if (hybridScheduleByEmp.has(sched.employee_id)) continue;
      const parsed = parseHybridScheduleNotes(sched.notes);
      if (parsed) {
        hybridScheduleByEmp.set(sched.employee_id, parsed);
      }
    }
  }

  type RawEmployeeRow = {
    id: string;
    profile_id?: string | null;
    job_title: string | null;
    work_mode: string | null;
    work_days: string[] | null;
    hybrid_onsite_days: string[] | null;
    shift_start: string | null;
    shift_end: string | null;
    employment_status: string | null;
  };

  const formattedEmployees: HRScheduleEmployee[] = ((employees ?? []) as RawEmployeeRow[])
    .map((emp) => {
      const p = emp.profile_id ? profileMap.get(emp.profile_id) ?? null : null;
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";
      const rawModel = (emp.work_mode === "remote" ? "wfh" : emp.work_mode) || "onsite";
      const parsedHybrid = hybridScheduleByEmp.get(emp.id);
      const defaultOnsite = Array.isArray(emp.hybrid_onsite_days)
        ? normalizeDaysToFull(emp.hybrid_onsite_days)
        : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const onsiteDays = parsedHybrid ? parsedHybrid.onsiteDays : defaultOnsite;
      const wfhDays = parsedHybrid
        ? parsedHybrid.wfhDays
        : rawModel === "hybrid"
          ? DAYS_FULL.slice(0, 5).filter((d) => !onsiteDays.includes(d))
          : [];

      return {
        id: emp.id,
        name,
        role: emp.job_title || "Staff",
        work_model: rawModel as HRScheduleEmployee["work_model"],
        hybrid_onsite_days: onsiteDays,
        hybrid_wfh_days: wfhDays,
        schedule_notes: parsedHybrid?.cleanNotes || "",
        shift_start: emp.shift_start || "09:00",
        shift_end: emp.shift_end || "18:00",
        leave_days: leaveDaysByEmp.get(emp.id) ?? [],
      };
    });

  const { full: todayDayName } = getPhtDayInfo();

  return (
    <HRSchedulesClient
      initialEmployees={formattedEmployees}
      todayDayName={todayDayName}
      pendingLeaveCount={pendingLeaveCount ?? 0}
    />
  );
}

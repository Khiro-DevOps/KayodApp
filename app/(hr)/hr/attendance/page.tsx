import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { computeUnexcusedAbsences, getTodayPhtIso } from "@/lib/attendance-absent";
import HRAttendanceClient, { type AttendanceRow } from "./hr-attendance-client";

export const metadata = {
  title: "Attendance Operations | Kayod HR",
  description: "Review, filter and act on employee attendance logs with geofence flags",
};

// ─── Raw DB row returned by the Supabase query ───────────────────────────────
type RawAttendanceLog = {
  id: string;
  employee_id: string;
  tenant_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: string | null;
  active_break_type: string | null;
  break_status: string | null;
  short_breaks_used: number | null;
  overbreak_minutes: number | null;
  total_lunch_minutes: number | null;
  total_break_minutes: number | null;
  distance_meters: number | null;
  zone_status:
    | "onsite_verified"
    | "remote_verified"
    | "outside_zone"
    | "location_unverified"
    | null;
  flag_reason: string | null;
  created_at: string | null;
  employees: {
    job_title: string | null;
    work_mode: string | null;
    shift_start: string | null;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
};

export default async function HRAttendancePage() {
  const supabase = await createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMeta = (
    (user as { raw_user_meta_data?: Record<string, unknown> })
      .raw_user_meta_data ?? {}
  ) as Record<string, unknown>;
  const authRole = (
    user.user_metadata?.role ?? rawMeta.role
  ) as string | undefined;

  const admin = getAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; tenant_id: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // ── Fetch attendance_logs (last 30 days) joined with employees + profiles ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: rawLogs } = await admin
    .from("attendance_logs")
    .select(
      `
      id,
      employee_id,
      tenant_id,
      clock_in,
      clock_out,
      status,
      active_break_type,
      break_status,
      short_breaks_used,
      overbreak_minutes,
      total_lunch_minutes,
      total_break_minutes,
      distance_meters,
      zone_status,
      flag_reason,
      created_at,
      employees (
        job_title,
        work_mode,
        shift_start,
        profiles (
          first_name,
          last_name,
          avatar_url
        )
      )
    `
    )
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  const logs = (rawLogs ?? []) as unknown as RawAttendanceLog[];

  // ── Today's date string for comparisons ────────────────────────────────────
  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  // ── Compute metric counts ───────────────────────────────────────────────────
  const todayLogs = logs.filter((l) => {
    if (!l.clock_in) return false;
    return new Date(l.clock_in).toLocaleDateString("en-CA") === todayStr;
  });

  const presentToday = new Set(todayLogs.map((l) => l.employee_id)).size;

  const computeLateness = (clockInIso: string | null, shiftStartRaw: string | null) => {
    if (!clockInIso) return { isLate: false, lateMinutes: 0 };
    const clockInDate = new Date(clockInIso);
    const [hStr, mStr] = (shiftStartRaw ?? "08:00").split(":");
    const targetH = parseInt(hStr, 10);
    const targetM = parseInt(mStr, 10);
    const shiftDate = new Date(clockInDate);
    shiftDate.setHours(Number.isNaN(targetH) ? 8 : targetH, Number.isNaN(targetM) ? 0 : targetM, 0, 0);
    const diffMins = Math.floor((clockInDate.getTime() - shiftDate.getTime()) / 60000);
    if (diffMins > 5) {
      return { isLate: true, lateMinutes: diffMins };
    }
    return { isLate: false, lateMinutes: 0 };
  };

  const lateToday = todayLogs.filter((l) => {
    return computeLateness(l.clock_in, l.employees?.shift_start ?? null).isLate;
  }).length;

  const outsideZoneFlags = logs.filter(
    (l) => l.zone_status === "outside_zone"
  ).length;

  // Fetch today's approved/pending leaves for metric
  let onLeaveCount = 0;
  {
    const todayISO = new Date().toISOString().slice(0, 10);
    const { count } = await admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "pending"])
      .lte("start_date", todayISO)
      .gte("end_date", todayISO);
    onLeaveCount = count ?? 0;
  }

  // ── Compute today's unexcused absences for active employees ────────────────
  const todayPht = getTodayPhtIso();

  const { data: activeEmployees } = await admin
    .from("employees")
    .select(
      `
      id,
      job_title,
      work_mode,
      work_days,
      shift_end,
      profiles (
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq("employment_status", "active");
  const activeEmpIds = (activeEmployees ?? []).map((e) => e.id);

  const { data: approvedTodayLeaves } = activeEmpIds.length
    ? await admin
        .from("leave_requests")
        .select("employee_id, start_date, end_date, status")
        .in("employee_id", activeEmpIds)
        .eq("status", "approved")
        .lte("start_date", todayPht)
        .gte("end_date", todayPht)
    : { data: [] as { employee_id: string; start_date: string; end_date: string; status: string }[] };

  const absentRows: AttendanceRow[] = [];
  for (const emp of activeEmployees ?? []) {
    const empLogs = logs
      .filter((l) => l.employee_id === emp.id && l.clock_in)
      .map((l) => ({ clock_in: l.clock_in }));
    const empLeaves = (approvedTodayLeaves ?? []).filter(
      (lr) => lr.employee_id === emp.id
    );

    const { absentDays } = computeUnexcusedAbsences({
      periodStart: todayPht,
      periodEnd: todayPht,
      workDays: Array.isArray(emp.work_days) ? (emp.work_days as string[]) : null,
      shiftEnd: emp.shift_end ?? null,
      attendanceLogs: empLogs,
      approvedLeaves: empLeaves,
    });

    if (absentDays > 0) {
      const p = Array.isArray(emp.profiles)
        ? (emp.profiles[0] as { first_name?: string | null; last_name?: string | null; avatar_url?: string | null } | undefined)
        : (emp.profiles as { first_name?: string | null; last_name?: string | null; avatar_url?: string | null } | null);
      const name =
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Employee";

      absentRows.push({
        id: `absent-${emp.id}-${todayPht}`,
        employeeName: name,
        avatarUrl: p?.avatar_url ?? null,
        jobTitle: emp.job_title ?? null,
        workSetup: (emp.work_mode as AttendanceRow["workSetup"]) ?? null,
        isToday: true,
        isLate: false,
        lateMinutes: 0,
        isAbsent: true,
        date: new Date(`${todayPht}T00:00:00+08:00`).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        clockIn: null,
        clockOut: null,
        distanceMeters: null,
        zoneStatus: "location_unverified",
        flagReason: "Unexcused absence (no clock-in or approved leave)",
      });
    }
  }

  const absentToday = absentRows.length;

  // ── Shape rows for the client component ────────────────────────────────────
  const rows: AttendanceRow[] = [
    ...absentRows,
    ...logs.map((l) => {
    const emp = l.employees;
    const p = emp?.profiles;
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      "Employee";
    const { isLate, lateMinutes } = computeLateness(l.clock_in, emp?.shift_start ?? null);
    const isToday = l.clock_in
      ? new Date(l.clock_in).toLocaleDateString("en-CA") === todayStr
      : false;

    const overbreakMinutes = l.overbreak_minutes ?? 0;
    let breakStatusLabel: AttendanceRow["breakStatusLabel"] = null;
    if (l.clock_in) {
      if (l.clock_out) {
        breakStatusLabel = "Clocked Out";
      } else if (l.active_break_type === "lunch" || l.break_status === "on_lunch") {
        breakStatusLabel = "On Lunch";
      } else if (l.active_break_type === "short_break" || l.break_status === "on_break") {
        breakStatusLabel = (l.short_breaks_used ?? 0) >= 2 ? "On Break (2/2)" : "On Break (1/2)";
      } else {
        breakStatusLabel = "Working";
      }
    }

    return {
      id: l.id,
      employeeName: name,
      avatarUrl: p?.avatar_url ?? null,
      jobTitle: emp?.job_title ?? null,
      workSetup: (emp?.work_mode as AttendanceRow["workSetup"]) ?? null,
      isToday,
      isLate,
      lateMinutes,
      breakStatusLabel,
      overbreakMinutes,
      date: l.clock_in
        ? new Date(l.clock_in).toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : l.created_at
        ? new Date(l.created_at).toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "—",
      clockIn: l.clock_in
        ? new Date(l.clock_in).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      clockOut: l.clock_out
        ? new Date(l.clock_out).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      distanceMeters: l.distance_meters ?? null,
      zoneStatus: l.zone_status ?? "location_unverified",
      flagReason: l.flag_reason ?? null,
    };
  }),
  ];

  return (
    <HRAttendanceClient
      rows={rows}
      tenantId={profile?.tenant_id ?? null}
      metrics={{
        presentToday,
        lateToday,
        outsideZoneFlags,
        onLeave: onLeaveCount,
        absentToday,
      }}
    />
  );
}

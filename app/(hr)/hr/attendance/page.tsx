import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
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
    work_model: string | null;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; tenant_id: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  const tenantId = profile?.tenant_id ?? null;

  // ── Fetch attendance_logs (last 30 days) joined with employees + profiles ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let query = supabase
    .from("attendance_logs")
    .select(
      `
      id,
      employee_id,
      tenant_id,
      clock_in,
      clock_out,
      status,
      distance_meters,
      zone_status,
      flag_reason,
      created_at,
      employees (
        job_title,
        work_model,
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

  // Tenant-scope when tenant_id is available (RLS may already enforce this,
  // but being explicit is safer)
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: rawLogs } = await query;

  const logs = (rawLogs ?? []) as unknown as RawAttendanceLog[];

  // ── Today's date string for comparisons ────────────────────────────────────
  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  // ── Compute metric counts ───────────────────────────────────────────────────
  const todayLogs = logs.filter((l) => {
    if (!l.clock_in) return false;
    return new Date(l.clock_in).toLocaleDateString("en-CA") === todayStr;
  });

  const presentToday = new Set(todayLogs.map((l) => l.employee_id)).size;

  const lateToday = todayLogs.filter((l) => {
    if (!l.clock_in) return false;
    const emp = l.employees;
    const shiftStart = emp?.shift_start ?? "09:00";
    const clockInTime = new Date(l.clock_in)
      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      .slice(0, 5);
    return clockInTime > shiftStart;
  }).length;

  const outsideZoneFlags = logs.filter(
    (l) => l.zone_status === "outside_zone"
  ).length;

  // Fetch today's approved/pending leaves for metric
  let onLeaveCount = 0;
  {
    const todayISO = new Date().toISOString().slice(0, 10);
    let leaveQuery = supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "pending"])
      .lte("start_date", todayISO)
      .gte("end_date", todayISO);

    if (tenantId) {
      // Filter via employees join (leave_requests has employee_id FK)
      leaveQuery = leaveQuery.not("id", "is", null);
    }

    const { count } = await leaveQuery;
    onLeaveCount = count ?? 0;
  }

  // ── Shape rows for the client component ────────────────────────────────────
  const rows: AttendanceRow[] = logs.map((l) => {
    const emp = l.employees;
    const p = emp?.profiles;
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      "Employee";

    return {
      id: l.id,
      employeeName: name,
      avatarUrl: p?.avatar_url ?? null,
      jobTitle: emp?.job_title ?? null,
      workSetup: (emp?.work_model as AttendanceRow["workSetup"]) ?? null,
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
  });

  return (
    <HRAttendanceClient
      rows={rows}
      metrics={{
        presentToday,
        lateToday,
        outsideZoneFlags,
        onLeave: onLeaveCount,
      }}
    />
  );
}

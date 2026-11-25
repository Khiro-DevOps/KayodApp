import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import ScheduleClient, { type WeeklyShiftRow } from "./schedule-client";
import { resolveEmployeeGeofence } from "@/lib/geofence-resolver";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import {
  formatDailyWorkModelLabel,
  resolveDailyWorkModel,
  resolveEmployeeSourceOfTruth,
} from "@/lib/work-arrangement";
import {
  DAYS_FULL,
  DEFAULT_LUNCH_END,
  DEFAULT_LUNCH_START,
  DEFAULT_SHIFT_END,
  DEFAULT_SHIFT_START,
  normalizeDaysToFull,
  parseHybridScheduleNotes,
  parseLunchScheduleNotes,
} from "@/lib/hybrid-schedule";
import { formatTime12h, type UndertimeRequestSummary } from "@/lib/undertime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getMondayPht(phtDateStr: string): Date {
  const base = new Date(`${phtDateStr}T00:00:00Z`);
  const day = base.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setUTCDate(base.getUTCDate() + diff);
  return base;
}

function getWeekDatesUtc(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

function toIsoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const metadata = {
  title: "My Personal Schedule | Kayod",
  description: "View your personal shift times, work setup, and weekly schedule",
};

export default async function EmployeeSchedulePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = getAdminClient();

  const { data: employee, error: empError } = await admin
    .from("employees")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!employee) {
    return (
      <PageContainer>
        <div className="w-full max-w-xl min-w-0 flex flex-col mx-auto px-4 py-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm space-y-3">
            <p className="font-semibold text-base">Employee profile not found.</p>
            <div className="text-xs space-y-1 font-mono break-all bg-white p-3 rounded border border-red-200">
              <p>
                <strong>Auth ID:</strong> {user.id}
              </p>
              <p>
                <strong>Supabase Error:</strong>{" "}
                {empError ? JSON.stringify(empError) : "null"}
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  const linkedJob = await getJobPostingPositionForProfile(user.id);
  const sourceOfTruth = resolveEmployeeSourceOfTruth({
    employee: {
      job_title: employee.job_title,
      work_mode: employee.work_mode,
    },
    offer: linkedJob
      ? {
        job_title: linkedJob.offerTitle,
        work_setup: linkedJob.offerWorkSetup,
      }
      : null,
    jobPosting: linkedJob
      ? {
        title: linkedJob.title,
        department: linkedJob.departmentName,
        work_setup: linkedJob.jobWorkSetup,
      }
      : null,
  });
  const effectiveWorkMode = sourceOfTruth.workSetup;
  const effectiveWorkLocationId =
    employee.work_location_id ?? linkedJob?.workLocationId;

  const todayPhtStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const thisWeekMonday = getMondayPht(todayPhtStr);
  const weekDates = getWeekDatesUtc(thisWeekMonday);
  const weekStartStr = toIsoDateUtc(weekDates[0]);
  const weekEndStr = toIsoDateUtc(weekDates[6]);
  const currentYear =
    Number.parseInt(todayPhtStr.slice(0, 4), 10) || new Date().getFullYear();

  const [
    { data: activeAttendanceLog },
    { data: logsData },
    { data: reqData },
    { data: otData },
    { data: wmData },
    { data: utData },
    { data: vlLedger },
    { data: publishedSchedule },
    { data: approvedLeaves },
    { data: todayOverride },
  ] = await Promise.all([
    admin
      .from("attendance_logs")
      .select(
        "id, clock_in, clock_out, status, verification_type, distance_meters, zone_status, break_status, active_break_type, lunch_start, lunch_end, total_lunch_minutes, break_start, total_break_minutes, short_breaks_used, overbreak_minutes, break_log, overtime_request_id, outside_approved_window"
      )
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .maybeSingle(),
    admin
      .from("attendance_logs")
      .select("id, date, clock_in, clock_out, status, total_hours, zone_status")
      .eq("employee_id", employee.id)
      .order("clock_in", { ascending: false })
      .limit(14),
    admin
      .from("attendance_correction_requests")
      .select(
        "id, attendance_log_id, target_date, correction_type, status, requested_clock_in, requested_clock_out, review_notes, created_at"
      )
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("overtime_requests")
      .select(
        "id, work_date, start_time, end_time, overtime_type, reason, status, review_note, used_at, created_at"
      )
      .eq("employee_id", employee.id)
      .gte("work_date", todayPhtStr)
      .order("work_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("work_mode_requests")
      .select(
        "id, request_date, requested_mode, reason, status, reviewer_remarks, created_at"
      )
      .eq("employee_id", employee.id)
      .gte("request_date", todayPhtStr)
      .order("request_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("undertime_requests")
      .select(
        "id, work_date, undertime_type, scheduled_in, scheduled_out, requested_in, requested_out, undertime_minutes, leave_credits_deducted, reason, coverage_notes, deduction_mode, status, supervisor_acted_at, hr_acted_at, rejection_reason, created_at"
      )
      .eq("employee_id", employee.id)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("employee_leave_balances")
      .select("entitled_days, used_days, pending_days")
      .eq("employee_id", employee.id)
      .eq("year", currentYear)
      .eq("leave_type", "VL")
      .eq("is_active", true)
      .maybeSingle<{
        entitled_days: number;
        used_days: number;
        pending_days: number;
      }>(),
    // Match /hr/schedules: fetch latest published schedule regardless of week_start
    admin
      .from("schedules")
      .select(
        "id, week_start, shift_start, shift_end, work_days, mon, tue, wed, thu, fri, sat, sun, location, notes, is_published, updated_at"
      )
      .eq("employee_id", employee.id)
      .eq("is_published", true)
      .order("week_start", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("leave_requests")
      .select("start_date, end_date, leave_type")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .lte("start_date", weekEndStr)
      .gte("end_date", weekStartStr),
    admin
      .from("employee_work_mode_overrides")
      .select("override_mode, reason")
      .eq("employee_id", employee.id)
      .eq("effective_date", todayPhtStr)
      .maybeSingle<{ override_mode?: string | null; reason?: string | null }>(),
  ]);

  const recentLogs = (logsData ?? []).map((l) => ({
    id: l.id,
    date: l.clock_in
      ? new Date(l.clock_in).toLocaleDateString("en-CA", {
        timeZone: "Asia/Manila",
      })
      : l.date,
    clock_in: l.clock_in,
    clock_out: l.clock_out,
    status: l.status,
    total_hours: l.total_hours,
    zone_status: l.zone_status,
  }));

  const todayCompletedLog = !activeAttendanceLog
    ? recentLogs.find(
      (l) => l.clock_out !== null && l.date === todayPhtStr
    ) ?? null
    : null;

  const correctionRequests = reqData ?? [];
  const overtimeRequests = otData ?? [];
  const workModeRequests = (wmData ?? []) as Array<{
    id: string;
    request_date: string;
    requested_mode: "onsite" | "wfh";
    reason: string;
    status: string;
    reviewer_remarks: string | null;
    created_at: string;
  }>;
  const undertimeRequests = (utData ?? []) as UndertimeRequestSummary[];

  const rawVl = vlLedger
    ? Number(vlLedger.entitled_days ?? 0) -
    Number(vlLedger.used_days ?? 0) -
    Number(vlLedger.pending_days ?? 0)
    : 0;
  const pendingUtVl = undertimeRequests
    .filter(
      (u) =>
        u.deduction_mode === "leave_offset" &&
        (u.status === "pending_supervisor" || u.status === "pending_hr") &&
        u.work_date.startsWith(`${currentYear}-`)
    )
    .reduce((sum, u) => sum + u.undertime_minutes / 480, 0);
  const availableVlCredits = Math.max(0, Number((rawVl - pendingUtVl).toFixed(4)));

  const isSchedulePublished = Boolean(publishedSchedule);
  const workModel: "onsite" | "wfh" | "hybrid" =
    effectiveWorkMode === "remote" || effectiveWorkMode === "wfh"
      ? "wfh"
      : effectiveWorkMode === "hybrid"
        ? "hybrid"
        : "onsite";

  const parsedHybrid = parseHybridScheduleNotes(publishedSchedule?.notes);
  const fallbackOnsiteDays: string[] = Array.isArray(employee?.hybrid_onsite_days)
    ? normalizeDaysToFull(employee.hybrid_onsite_days)
    : Array.isArray(employee?.work_days)
      ? normalizeDaysToFull(employee.work_days)
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const hybridOnsiteDays = parsedHybrid
    ? parsedHybrid.onsiteDays
    : fallbackOnsiteDays;
  const hybridWfhDays = parsedHybrid
    ? parsedHybrid.wfhDays
    : workModel === "hybrid"
      ? DAYS_FULL.slice(0, 5).filter((d) => !hybridOnsiteDays.includes(d))
      : [];
  const hybridDays =
    workModel === "hybrid"
      ? normalizeDaysToFull([...hybridOnsiteDays, ...hybridWfhDays])
      : fallbackOnsiteDays;

  const shiftStart =
    publishedSchedule?.shift_start || employee?.shift_start || DEFAULT_SHIFT_START;
  const shiftEnd =
    publishedSchedule?.shift_end || employee?.shift_end || DEFAULT_SHIFT_END;
  const parsedLunch = parseLunchScheduleNotes(publishedSchedule?.notes);
  const lunchStart = parsedLunch.lunchStart || DEFAULT_LUNCH_START;
  const lunchEnd = parsedLunch.lunchEnd || DEFAULT_LUNCH_END;
  const formattedShiftRange = `${formatTime12h(shiftStart)} – ${formatTime12h(shiftEnd)}`;

  const getLeaveForDate = (dateIso: string) =>
    (approvedLeaves ?? []).find(
      (lr) => lr.start_date <= dateIso && lr.end_date >= dateIso
    ) ?? null;

  const scheduleInputForResolver = {
    mon: publishedSchedule?.mon ?? null,
    tue: publishedSchedule?.tue ?? null,
    wed: publishedSchedule?.wed ?? null,
    thu: publishedSchedule?.thu ?? null,
    fri: publishedSchedule?.fri ?? null,
    sat: publishedSchedule?.sat ?? null,
    sun: publishedSchedule?.sun ?? null,
    notes: publishedSchedule?.notes ?? null,
    onsite_days: hybridOnsiteDays,
    wfh_days: hybridWfhDays,
    work_days: Array.isArray(publishedSchedule?.work_days) && publishedSchedule.work_days.length > 0
      ? publishedSchedule.work_days
      : Array.isArray(employee?.work_days)
        ? employee.work_days
        : null,
    daily_work_modes:
      (employee?.daily_work_modes as Record<string, string> | null) ?? null,
  };

  const overrideModeNormalized = todayOverride?.override_mode?.trim().toLowerCase();
  const validTodayOverride =
    overrideModeNormalized === "onsite" || overrideModeNormalized === "wfh"
      ? (overrideModeNormalized as "onsite" | "wfh")
      : null;

  // Single synced weekly day map shared by Today Status Strip, 7-day strip, and daily shift rows
  const weekDays: WeeklyShiftRow[] = weekDates.map((date, i) => {
    const dateStr = toIsoDateUtc(date);
    const isToday = dateStr === todayPhtStr;
    const isPast = dateStr < todayPhtStr;
    const leaveEntry = getLeaveForDate(dateStr);

    const resolvedModel = resolveDailyWorkModel({
      contractWorkSetup: effectiveWorkMode,
      schedule: scheduleInputForResolver,
      date: new Date(`${dateStr}T12:00:00+08:00`),
    });

    const dayMode: "onsite" | "wfh" | "off" =
      isToday && validTodayOverride ? validTodayOverride : resolvedModel;
    const isOnsite = dayMode === "onsite";
    const isOff = dayMode === "off";

    const shiftTitle = leaveEntry
      ? `On Leave (${leaveEntry.leave_type})`
      : isOff
        ? "No Shift"
        : isOnsite
          ? "Standard Shift"
          : "Remote Work";

    const statusLabel = leaveEntry
      ? "On Leave"
      : isOff
        ? "OFF"
        : isToday
          ? "ACTIVE"
          : isPast
            ? "COMPLETED"
            : "UPCOMING";

    const statusStyle = leaveEntry
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : isOff
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : isToday
          ? "bg-[#1e1b4b] text-white border-[#1e1b4b]"
          : isPast
            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
            : "bg-gray-100 text-gray-700 border-gray-200";

    return {
      dateStr,
      dayShort: DAYS_SHORT[i],
      dayFull: DAYS_LONG[i],
      dayNumber: date.getUTCDate(),
      isToday,
      isPast,
      isOff,
      isOnsite,
      dayMode,
      leaveType: leaveEntry?.leave_type ?? null,
      shiftTitle,
      statusLabel,
      statusStyle,
      formattedShiftRange,
      scheduledOut: shiftEnd,
    };
  });

  const todayWeekRow = weekDays.find((d) => d.isToday);
  const todayDailyModel = todayWeekRow
    ? todayWeekRow.dayMode
    : validTodayOverride ??
    resolveDailyWorkModel({
      contractWorkSetup: effectiveWorkMode,
      schedule: scheduleInputForResolver,
      date: new Date(`${todayPhtStr}T12:00:00+08:00`),
    });
  const isTodayOnsite = todayDailyModel === "onsite";
  const todayApprovedLeave = getLeaveForDate(todayPhtStr);

  const geofence = await resolveEmployeeGeofence(admin, {
    id: employee.id,
    tenant_id: employee.tenant_id,
    work_mode: effectiveWorkMode,
    work_location_id: effectiveWorkLocationId,
    fallback_work_location_id: linkedJob?.workLocationId ?? null,
    hybrid_onsite_days: employee.hybrid_onsite_days,
    work_days: employee.work_days,
    onsite_days: hybridOnsiteDays,
    wfh_days: hybridWfhDays,
    todayDailyModel,
  });

  const hasOfficeCoordinates = geofence.configured;
  const locationName = geofence.name;
  const locationAddress =
    geofence.address ||
    (geofence.configured ? "Address not specified" : geofence.error);

  const weekRangeLabel = `${weekDates[0].toLocaleDateString("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })} – ${weekDates[6].toLocaleDateString("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })}`;

  return (
    <PageContainer>
      <div className="w-full min-w-0 space-y-6">
        <ScheduleClient
          employeeId={employee.id}
          hasSupervisor={Boolean(employee.reports_to)}
          availableVlCredits={availableVlCredits}
          workModel={workModel}
          workSetupLabel={sourceOfTruth.workSetupLabel}
          todayDailyModelLabel={
            todayApprovedLeave
              ? "On Approved Leave"
              : formatDailyWorkModelLabel(todayDailyModel)
          }
          todayWorkModel={todayDailyModel}
          todayApprovedLeave={
            todayApprovedLeave ? { leave_type: todayApprovedLeave.leave_type } : null
          }
          overtimeRequests={overtimeRequests}
          workModeRequests={workModeRequests}
          undertimeRequests={undertimeRequests}
          weekDays={weekDays}
          weekRangeLabel={weekRangeLabel}
          isSchedulePublished={isSchedulePublished}
          workDays={hybridDays}
          dailyWorkModes={
            (employee?.daily_work_modes as Record<string, string> | null) ?? null
          }
          isTodayOnsite={isTodayOnsite}
          hasOfficeCoordinates={hasOfficeCoordinates}
          shiftStart={shiftStart}
          shiftEnd={shiftEnd}
          lunchStart={lunchStart}
          lunchEnd={lunchEnd}
          initialActiveLog={activeAttendanceLog}
          initialTodayCompletedLog={todayCompletedLog}
          recentLogs={recentLogs}
          correctionRequests={correctionRequests}
          todayDateStr={todayPhtStr}
          allowedRadiusMeters={geofence.radiusMeters}
          locationName={locationName}
          locationAddress={locationAddress}
          targetOfficeCoords={
            geofence.configured
              ? {
                lat: geofence.latitude,
                lng: geofence.longitude,
                name: geofence.name,
              }
              : null
          }
          geofenceError={geofence.configured ? null : geofence.error}
          remoteAddress={
            geofence.mode === "remote_residence" && geofence.address
              ? geofence.address
              : "Registered Remote Residence"
          }
        />
      </div>
    </PageContainer>
  );
}

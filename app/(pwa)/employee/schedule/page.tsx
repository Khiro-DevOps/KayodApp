import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import ScheduleClient from "./schedule-client";
import ScheduleOverviewCard from "./_components/ScheduleOverviewCard";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import { resolveEmployeeGeofence } from "@/lib/geofence-resolver";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import {
  formatDailyWorkModelLabel,
  resolveDailyWorkModel,
  resolveEmployeeSourceOfTruth,
} from "@/lib/work-arrangement";
import {
  DAYS_FULL,
  DEFAULT_SHIFT_END,
  DEFAULT_SHIFT_START,
  getPhtDayInfo,
  normalizeDaysToFull,
  parseHybridScheduleNotes,
  parseLunchScheduleNotes,
} from "@/lib/hybrid-schedule";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatTime12h(timeStr: string) {
  if (!timeStr) return "08:00 AM";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const paddedH = h < 10 ? `0${h}` : `${h}`;
  return `${paddedH}:${mStr || "00"} ${ampm}`;
}

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

  // Keep this lookup independent of optional branch tables/relationships so a
  // newly provisioned development employee can still view the schedule.
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
            <p className="font-semibold text-base">
              Employee profile not found.
            </p>
            <div className="text-xs space-y-1 font-mono break-all bg-white p-3 rounded border border-red-200">
              <p><strong>Auth ID:</strong> {user.id}</p>
              <p><strong>Supabase Error:</strong> {empError ? JSON.stringify(empError) : "null"}</p>
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
  const effectiveWorkLocationId = employee.work_location_id ?? linkedJob?.workLocationId;

  // Fetch active attendance log + recent logs + correction requests
  const todayPhtStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  let activeAttendanceLog = null;
  let todayCompletedLog = null;
  let recentLogs: Array<{
    id: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string | null;
    total_hours: number | null;
    zone_status: string | null;
  }> = [];
  let correctionRequests: Array<{
    id: string;
    attendance_log_id: string | null;
    target_date: string;
    correction_type: string;
    status: string;
    requested_clock_in: string;
    requested_clock_out: string | null;
    review_notes: string | null;
    created_at: string;
  }> = [];

  if (employee?.id) {
    const { data: activeLog } = await admin
      .from("attendance_logs")
      .select(
        "id, clock_in, clock_out, status, verification_type, distance_meters, zone_status, break_status, active_break_type, lunch_start, lunch_end, total_lunch_minutes, break_start, total_break_minutes, short_breaks_used, overbreak_minutes, break_log"
      )
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .maybeSingle();
    activeAttendanceLog = activeLog;

    const { data: logsData } = await admin
      .from("attendance_logs")
      .select("id, date, clock_in, clock_out, status, total_hours, zone_status")
      .eq("employee_id", employee.id)
      .order("clock_in", { ascending: false })
      .limit(14);

    recentLogs = (logsData ?? []).map((l) => ({
      id: l.id,
      date: l.clock_in
        ? new Date(l.clock_in).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
        : l.date,
      clock_in: l.clock_in,
      clock_out: l.clock_out,
      status: l.status,
      total_hours: l.total_hours,
      zone_status: l.zone_status,
    }));

    if (!activeAttendanceLog) {
      todayCompletedLog =
        recentLogs.find((l) => l.clock_out !== null && l.date === todayPhtStr) ?? null;
    }

    const { data: reqData } = await admin
      .from("attendance_correction_requests")
      .select(
        "id, attendance_log_id, target_date, correction_type, status, requested_clock_in, requested_clock_out, review_notes, created_at"
      )
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(30);

    correctionRequests = reqData ?? [];
  }

  // Fetch today and upcoming overtime requests
  let overtimeRequests: Array<{
    id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    reason: string;
    status: string;
    review_note: string | null;
    used_at: string | null;
    created_at: string;
  }> = [];

  if (employee?.id) {
    const { data: otData } = await admin
      .from("overtime_requests")
      .select("id, work_date, start_time, end_time, reason, status, review_note, used_at, created_at")
      .eq("employee_id", employee.id)
      .gte("work_date", todayPhtStr)
      .order("work_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20);

    overtimeRequests = otData ?? [];
  }

  // Safe default values if employee record is not found (e.g. testing / newly promoted)
  const todayDate = new Date();
  const thisWeekMonday = getMonday(todayDate);
  const thisWeekMondayStr = `${thisWeekMonday.getFullYear()}-${String(thisWeekMonday.getMonth() + 1).padStart(2, "0")}-${String(thisWeekMonday.getDate()).padStart(2, "0")}`;

  const { data: publishedSchedule } = await admin
    .from("schedules")
    .select("id, week_start, shift_start, shift_end, location, notes, is_published, updated_at")
    .eq("employee_id", employee.id)
    .eq("week_start", thisWeekMondayStr)
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .maybeSingle();

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
  const hybridOnsiteDays = parsedHybrid ? parsedHybrid.onsiteDays : fallbackOnsiteDays;
  const hybridWfhDays = parsedHybrid
    ? parsedHybrid.wfhDays
    : workModel === "hybrid"
      ? DAYS_FULL.slice(0, 5).filter((d) => !hybridOnsiteDays.includes(d))
      : [];
  const hybridDays =
    workModel === "hybrid"
      ? normalizeDaysToFull([...hybridOnsiteDays, ...hybridWfhDays])
      : fallbackOnsiteDays;
  const shiftStart = publishedSchedule?.shift_start || employee?.shift_start || DEFAULT_SHIFT_START;
  const shiftEnd = publishedSchedule?.shift_end || employee?.shift_end || DEFAULT_SHIFT_END;
  const { lunchStart, lunchEnd } = parseLunchScheduleNotes(publishedSchedule?.notes);

  getPhtDayInfo();
  const todayDateStr = todayDate.toISOString().split("T")[0];

  const getDayWorkMode = (dayName: string, dayIndex: number): "onsite" | "wfh" | "off" => {
    const isWeekend = dayIndex >= 5;
    const norm = dayName.trim().toLowerCase();
    if (workModel === "onsite") {
      return isWeekend ? "off" : "onsite";
    }
    if (workModel === "wfh") {
      return isWeekend ? "off" : "wfh";
    }
    if (hybridOnsiteDays.some((d) => d.toLowerCase() === norm)) return "onsite";
    if (parsedHybrid) {
      return hybridWfhDays.some((d) => d.toLowerCase() === norm) ? "wfh" : "off";
    }
    return isWeekend ? "off" : "wfh";
  };

  const todayDailyModel = resolveDailyWorkModel({
    contractWorkSetup: effectiveWorkMode,
    schedule: {
      notes: publishedSchedule?.notes ?? null,
      onsite_days: hybridOnsiteDays,
      wfh_days: hybridWfhDays,
      work_days: Array.isArray(employee?.work_days) ? employee.work_days : null,
    },
    date: todayDate,
  });
  const isTodayOnsite = todayDailyModel === "onsite";

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

  const weekDates = getWeekDates(thisWeekMonday);
  const weekStartStr = thisWeekMondayStr;
  const weekEndDate = weekDates[6];
  const weekEndStr = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}`;

  const { data: approvedLeaves } = await admin
    .from("leave_requests")
    .select("start_date, end_date, leave_type")
    .eq("employee_id", employee.id)
    .eq("status", "approved")
    .lte("start_date", weekEndStr)
    .gte("end_date", weekStartStr);

  const getLeaveForDate = (dateIso: string) =>
    (approvedLeaves ?? []).find(
      (lr) => lr.start_date <= dateIso && lr.end_date >= dateIso
    ) ?? null;
  const todayApprovedLeave = getLeaveForDate(todayPhtStr);

  const formattedShiftRange = `${formatTime12h(shiftStart)} - ${formatTime12h(shiftEnd)}`;

  const locationName = geofence.name;
  const locationAddress =
    geofence.address ||
    (geofence.configured ? "Address not specified" : geofence.error);
  const locationRadius = geofence.radiusMeters;

  return (
    <PageContainer>
      <div className="w-full min-w-0 space-y-6">
        <PwaHeroBanner
          title="My Schedule & Attendance"
          subtitle="Clock in from your assigned zone and track your weekly shifts"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Today&apos;s Work Model</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-[#1E1B4B] sm:text-lg">
                  {formatDailyWorkModelLabel(todayDailyModel)}
                </p>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1E1B4B]">
                  Work Setup: {sourceOfTruth.workSetupLabel}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Shift Hours</p>
              <p className="mt-1 truncate text-base font-bold text-[#1E1B4B] sm:text-lg">{formattedShiftRange}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm sm:col-span-1">
              <p className="text-xs font-medium text-slate-500">Assigned Zone</p>
              <p className="mt-1 truncate text-base font-bold text-[#1E1B4B] sm:text-lg">{locationName}</p>
            </div>
          </div>
        </PwaHeroBanner>

        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-start gap-6 px-4 sm:px-6 lg:grid-cols-12 lg:px-10">
          {/* Left Column: Attendance Clock-In & Workspace Geofence */}
          <div className="lg:col-span-6 space-y-5 min-w-0">
            <ScheduleClient
              employeeId={employee?.id || ""}
              workModel={workModel}
              todayWorkModel={todayDailyModel}
              todayApprovedLeave={
                todayApprovedLeave ? { leave_type: todayApprovedLeave.leave_type } : null
              }
              overtimeRequests={overtimeRequests}
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

          {/* Right Column: Schedule Overview & Personal Weekly Shift Calendar */}
          <div className="lg:col-span-6 space-y-5 min-w-0">
            <ScheduleOverviewCard
              workMode={workModel}
              shiftStart={shiftStart}
              shiftEnd={shiftEnd}
              lunchStart={lunchStart}
              lunchEnd={lunchEnd}
              workDays={hybridDays}
              assignedLocationName={locationName}
              assignedLocationAddress={locationAddress}
              radiusMeters={locationRadius}
              employeeId={employee?.id}
            />

            {/* Part 2.2: Personal Weekly Shift Calendar */}
            <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_12px_rgba(39,36,84,0.06)] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                    Personal Weekly Shift Calendar
                  </p>
                  {isSchedulePublished && (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Published
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary font-medium">
                  {thisWeekMonday.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                  {" – "}
                  {weekDates[6].toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </p>
              </div>

              {/* 7-Day interactive strip (Mon - Sun) */}
              <div className="grid grid-cols-7 gap-1.5">
                {weekDates.map((date, i) => {
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  const isToday = dateStr === todayDateStr;
                  const dayName = DAYS_LONG[i];
                  const dayMode = getDayWorkMode(dayName, i);
                  const isOnsite = dayMode === "onsite";
                  const isOff = dayMode === "off";
                  const leaveEntry = getLeaveForDate(dateStr);

                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center rounded-xl py-2.5 text-center text-xs transition-colors ${isToday
                        ? "bg-[#1e1b4b] text-white shadow-sm ring-2 ring-[#1e1b4b]/20"
                        : leaveEntry
                          ? "bg-amber-50 border border-amber-200 text-amber-800"
                          : isOff
                            ? "bg-[#f7f6fc] border border-[#e6e4f0] text-text-secondary opacity-75"
                            : isOnsite
                              ? "bg-indigo-50 border border-indigo-200 text-indigo-800"
                              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                        }`}
                    >
                      <span className="font-semibold">{DAYS_SHORT[i]}</span>
                      <span className={`mt-0.5 text-[11px] ${isToday ? "text-white/80" : "opacity-75"}`}>
                        {date.getDate()}
                      </span>
                      <span
                        className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isToday
                          ? isOff
                            ? "bg-white/15 text-white"
                            : isOnsite
                              ? "bg-indigo-500/40 text-white"
                              : "bg-emerald-500/40 text-white"
                          : ""
                          }`}
                      >
                        {leaveEntry ? "On Leave" : isOff ? "Off" : isOnsite ? "Onsite" : "WFH"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Detailed Day-by-Day Shift Cards */}
              <div className="space-y-2 pt-2">
                {weekDates.map((date, i) => {
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  const isToday = dateStr === todayDateStr;
                  const isPast = date < new Date(todayDateStr);
                  const dayName = DAYS_LONG[i];
                  const dayMode = getDayWorkMode(dayName, i);
                  const isOnsite = dayMode === "onsite";
                  const isOff = dayMode === "off";
                  const leaveEntry = getLeaveForDate(dateStr);

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

                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${isToday
                        ? "border-slate-300 bg-slate-50 shadow-sm"
                        : "border-[#e6e4f0] bg-white hover:border-slate-300"
                        }`}
                    >
                      {/* Left Column: Day/Date Box */}
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center rounded-xl bg-[#f7f6fc] border border-[#e6e4f0] w-12 h-12 shrink-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                            {DAYS_SHORT[i]}
                          </span>
                          <span className="text-base font-extrabold text-text-primary leading-tight">
                            {date.getDate()}
                          </span>
                        </div>

                        {/* Middle Column: Shift Title + Hours */}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-text-primary">{shiftTitle}</p>
                            {!isOff && !leaveEntry && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isOnsite
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  }`}
                              >
                                {isOnsite ? "Onsite" : "WFH"}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-text-secondary font-medium">
                            {leaveEntry ? "Approved Leave" : isOff ? "Scheduled Rest Day" : formattedShiftRange}
                          </p>
                        </div>
                      </div>

                      {/* Right Column: Status Pill */}
                      <div>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

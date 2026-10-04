import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/ui/page-container";
import ScheduleClient from "./schedule-client";
import ScheduleOverviewCard from "./_components/ScheduleOverviewCard";

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
  if (!timeStr) return "09:00 AM";
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

  // Fetch employee record with office_branches join
  let { data: employee, error: empError } = await supabase
    .from("employees")
    .select(`
      *,
      office_branches ( id, name, address, latitude, longitude, radius_meters )
    `)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const { data: empByEmail } = await supabase
      .from("employees")
      .select(`
        *,
        office_branches ( id, name, address, latitude, longitude, radius_meters )
      `)
      .eq("email", user.email)
      .maybeSingle();
    employee = empByEmail;
  }

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

  // Fetch employee remote residence if remote/hybrid
  const { data: remoteResidence } = await supabase
    .from("employee_remote_residences")
    .select("*")
    .eq("employee_id", employee.id)
    .maybeSingle();

  const assignedBranch = Array.isArray((employee as any)?.office_branches)
    ? (employee as any)?.office_branches[0]
    : (employee as any)?.office_branches;

  const hasOfficeCoordinates = Boolean(
    assignedBranch && assignedBranch.latitude != null && assignedBranch.longitude != null
  );

  // Fetch active attendance log if any
  let activeAttendanceLog = null;
  if (employee?.id) {
    const { data: activeLog } = await supabase
      .from("attendance_logs")
      .select("id, clock_in, clock_out, status, verification_type, break_status")
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .maybeSingle();
    activeAttendanceLog = activeLog;
  }

  // Safe default values if employee record is not found (e.g. testing / newly promoted)
  const workModel: "onsite" | "wfh" | "hybrid" = (employee?.work_model as any) || (employee?.work_mode as any) || "onsite";
  const hybridDays: string[] = Array.isArray(employee?.hybrid_onsite_days)
    ? employee.hybrid_onsite_days
    : Array.isArray(employee?.work_days)
    ? employee.work_days
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const shiftStart = employee?.shift_start || "09:00";
  const shiftEnd = employee?.shift_end || "18:00";

  const todayDate = new Date();
  const todayDayName = todayDate.toLocaleDateString("en-US", { weekday: "long" });
  const todayDateStr = todayDate.toISOString().split("T")[0];

  const isDayOnsite = (dayName: string) => {
    if (workModel === "onsite") return true;
    if (workModel === "wfh") return false;
    const normDays = hybridDays.map((d) => d.trim().toLowerCase());
    return normDays.includes(dayName.toLowerCase());
  };

  const isTodayOnsite = isDayOnsite(todayDayName);

  const thisWeekMonday = getMonday(todayDate);
  const weekDates = getWeekDates(thisWeekMonday);

  const formattedShiftRange = `${formatTime12h(shiftStart)} - ${formatTime12h(shiftEnd)}`;

  const locationName = (workModel as string) === "wfh" || (workModel as string) === "remote"
    ? "Remote Residence"
    : assignedBranch?.name || "Company Head Office";
  const locationAddress = (workModel as string) === "wfh" || (workModel as string) === "remote"
    ? remoteResidence?.address || "Registered Remote Residence, Metro Manila"
    : assignedBranch?.address || "Company HQ, Makati City, Metro Manila";
  const locationRadius = (workModel as string) === "wfh" || (workModel as string) === "remote"
    ? remoteResidence?.geofence_radius_meters || 200
    : assignedBranch?.radius_meters || 200;

  return (
    <PageContainer>
      <div className="w-full max-w-xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-5">
        {/* Part 2.1: Dynamic Attendance & Clock-In UI Card */}
        <ScheduleClient
          employeeId={employee?.id || ""}
          workModel={workModel}
          isTodayOnsite={isTodayOnsite}
          hasOfficeCoordinates={hasOfficeCoordinates}
          shiftStart={shiftStart}
          shiftEnd={shiftEnd}
          initialActiveLog={activeAttendanceLog}
          targetOfficeCoords={
            assignedBranch?.latitude && assignedBranch?.longitude
              ? { lat: Number(assignedBranch.latitude), lng: Number(assignedBranch.longitude), name: assignedBranch.name || "Assigned Office Location" }
              : remoteResidence?.latitude && remoteResidence?.longitude
              ? { lat: Number(remoteResidence.latitude), lng: Number(remoteResidence.longitude), name: "Registered Remote Residence" }
              : { lat: 14.5547, lng: 121.0244, name: "Company Head Office (Makati HQ)" }
          }
          remoteAddress={remoteResidence?.address || "Registered Remote Residence, Metro Manila"}
        />

        {/* Part 2.3: Modern Schedule Overview Card */}
        <ScheduleOverviewCard
          workMode={workModel}
          shiftStart={shiftStart}
          shiftEnd={shiftEnd}
          workDays={hybridDays}
          assignedLocationName={locationName}
          assignedLocationAddress={locationAddress}
          radiusMeters={locationRadius}
          employeeId={employee?.id}
        />

        {/* Part 2.2: Personal Weekly Shift Calendar */}
        <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_12px_rgba(39,36,84,0.06)] space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Personal Weekly Shift Calendar
            </p>
            <p className="text-xs text-text-secondary font-medium">
              {thisWeekMonday.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
              {" – "}
              {weekDates[6].toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
            </p>
          </div>

          {/* 7-Day interactive strip (Mon - Sun) */}
          <div className="grid grid-cols-7 gap-1.5">
            {weekDates.map((date, i) => {
              const dateStr = date.toISOString().split("T")[0];
              const isToday = dateStr === todayDateStr;
              const dayName = DAYS_LONG[i];
              const isOnsite = isDayOnsite(dayName);
              const isWeekend = i >= 5;

              return (
                <div
                  key={i}
                  className={`flex flex-col items-center rounded-xl py-2.5 text-center text-xs transition-colors ${
                    isToday
                      ? "bg-primary text-white shadow-sm ring-2 ring-primary/30"
                      : isWeekend
                      ? "bg-[#f7f6fc] border border-[#e6e4f0] text-text-secondary opacity-75"
                      : isOnsite
                      ? "bg-blue-50 border border-blue-200 text-blue-800"
                      : "bg-purple-50 border border-purple-200 text-purple-800"
                  }`}
                >
                  <span className="font-semibold">{DAYS_SHORT[i]}</span>
                  <span className={`mt-0.5 text-[11px] ${isToday ? "text-white/80" : "opacity-75"}`}>
                    {date.getDate()}
                  </span>
                  <span className="mt-1 text-[10px] font-bold">
                    {isWeekend ? "Off" : isOnsite ? "Onsite" : "WFH"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Detailed Day-by-Day Shift Cards (Stitch Spec) */}
          <div className="space-y-2 pt-2">
            {weekDates.map((date, i) => {
              const dateStr = date.toISOString().split("T")[0];
              const isToday = dateStr === todayDateStr;
              const isPast = date < new Date(todayDateStr);
              const dayName = DAYS_LONG[i];
              const isOnsite = isDayOnsite(dayName);
              const isWeekend = i >= 5;

              let shiftTitle = isWeekend ? "No Shift" : isOnsite ? "Standard Shift" : "Remote Work";
              let statusLabel = isWeekend ? "OFF" : isToday ? "ACTIVE" : isPast ? "COMPLETED" : "UPCOMING";
              let statusStyle = isWeekend
                ? "bg-gray-100 text-gray-600 border-gray-200"
                : isToday
                ? "bg-purple-100 text-purple-800 border-purple-200"
                : isPast
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : "bg-gray-100 text-gray-700 border-gray-200";

              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                    isToday
                      ? "border-purple-300 bg-purple-50/40 shadow-sm"
                      : "border-[#e6e4f0] bg-white hover:border-[#cfcaf8]"
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
                        {!isWeekend && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isOnsite ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                            {isOnsite ? "Onsite" : "WFH"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-secondary font-medium">
                        {isWeekend ? "Scheduled Rest Day" : formattedShiftRange}
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
    </PageContainer>
  );
}

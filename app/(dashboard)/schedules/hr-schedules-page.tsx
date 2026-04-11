import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { assignShift } from "./actions";

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const SHIFT_TIMES: Record<string, { start: string; end: string; color: string }> = {
  morning:   { start: "08:00", end: "17:00", color: "bg-amber-100 text-amber-800 border-amber-200" },
  afternoon: { start: "13:00", end: "22:00", color: "bg-blue-100 text-blue-800 border-blue-200" },
  evening:   { start: "17:00", end: "02:00", color: "bg-purple-100 text-purple-800 border-purple-200" },
  night:     { start: "22:00", end: "07:00", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SchedulesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  const thisWeek  = getMonday(new Date());
  const weekStr   = thisWeek.toISOString().split("T")[0];
  const weekDates = getWeekDates(thisWeek);

  // Get all active employees
  const { data: employees } = await supabase
    .from("employees")
    .select("id, job_title, profiles(first_name, last_name)")
    .eq("employment_status", "active");

  // Get schedules for this week
  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("week_start", weekStr);

  // Get leave requests for this week (approved)
  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("employee_id, leave_type, start_date, end_date, status")
    .eq("status", "approved")
    .lte("start_date", weekDates[6].toISOString().split("T")[0])
    .gte("end_date", weekDates[0].toISOString().split("T")[0]);

  // Build schedule map: employeeId -> dayIndex -> shift
  const scheduleMap: Record<string, Record<number, string>> = {};
  (schedules ?? []).forEach((s) => {
    if (!scheduleMap[s.employee_id]) scheduleMap[s.employee_id] = {};
    // Find which day this schedule falls on
    const shiftDate = new Date(s.week_start);
    scheduleMap[s.employee_id][0] = s.shift; // simplified: store shift for week
  });

  // Build leave map: employeeId -> Set of date strings
  const leaveMap: Record<string, Set<string>> = {};
  (leaves ?? []).forEach((l) => {
    if (!leaveMap[l.employee_id]) leaveMap[l.employee_id] = new Set();
    const start = new Date(l.start_date);
    const end   = new Date(l.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveMap[l.employee_id].add(d.toISOString().split("T")[0]);
    }
  });

  if (!isHR) {
    // Employee sees only their own schedule
    const { data: emp } = await supabase
      .from("employees").select("id").eq("profile_id", user.id).single();

    if (!emp) redirect("/dashboard");

    const mySchedules = (schedules ?? []).filter((s) => s.employee_id === emp.id);
    const myLeaves = leaveMap[emp.id] ?? new Set();

    return (
      <PageContainer>
        <div className="space-y-5">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            My schedule
          </h1>
          <WeekHeader weekDates={weekDates} />
          <div className="space-y-2">
            {weekDates.map((date, i) => {
              const dateStr = date.toISOString().split("T")[0];
              const isOnLeave = myLeaves.has(dateStr);
              const shift = mySchedules[0]?.shift;
              const shiftInfo = shift ? SHIFT_TIMES[shift] : null;
              const isToday = dateStr === new Date().toISOString().split("T")[0];

              return (
                <div key={i} className={`rounded-xl border p-3 flex items-center justify-between ${isToday ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
                  <div>
                    <p className={`text-sm font-medium ${isToday ? "text-primary" : "text-text-primary"}`}>
                      {DAYS[i]} {date.getDate()}
                    </p>
                    {isOnLeave ? (
                      <p className="text-xs text-amber-600 font-medium">On leave</p>
                    ) : shiftInfo ? (
                      <p className="text-xs text-text-secondary">{shiftInfo.start} — {shiftInfo.end}</p>
                    ) : (
                      <p className="text-xs text-text-tertiary">No shift assigned</p>
                    )}
                  </div>
                  {isOnLeave ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Leave</span>
                  ) : shift ? (
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${SHIFT_TIMES[shift]?.color}`}>{shift}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </PageContainer>
    );
  }

  // HR view — full team schedule
  return (
    <PageContainer>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Schedules
          </h1>
          <span className="text-xs text-text-secondary">
            Week of {thisWeek.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
          </span>
        </div>

        <WeekHeader weekDates={weekDates} />

        {/* Assign shift form */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Assign shift</h2>
          <form action={assignShift} className="space-y-3">
            <input type="hidden" name="week_start" value={weekStr} />
            <select name="employee_id" required
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-white outline-none focus:border-primary">
              <option value="">Select employee...</option>
              {(employees ?? []).map((emp) => {
                const p = emp.profiles as unknown as { first_name: string; last_name: string };
                return (
                  <option key={emp.id} value={emp.id}>
                    {p?.first_name} {p?.last_name} — {emp.job_title}
                  </option>
                );
              })}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select name="shift" required
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-white outline-none focus:border-primary">
                <option value="morning">Morning (8AM–5PM)</option>
                <option value="afternoon">Afternoon (1PM–10PM)</option>
                <option value="evening">Evening (5PM–2AM)</option>
                <option value="night">Night (10PM–7AM)</option>
              </select>
              <input type="text" name="location" placeholder="Location (optional)"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <button type="submit"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
              Assign shift
            </button>
          </form>
        </div>

        {/* Team schedule grid */}
        {(employees ?? []).length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">No active employees</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(employees ?? []).map((emp) => {
              const p = emp.profiles as unknown as { first_name: string; last_name: string };
              const fullName = p ? `${p.first_name} ${p.last_name}` : "Employee";
              const empSchedules = (schedules ?? []).filter((s) => s.employee_id === emp.id);
              const empLeaves = leaveMap[emp.id] ?? new Set();
              const shift = empSchedules[0]?.shift;
              const shiftInfo = shift ? SHIFT_TIMES[shift] : null;

              return (
                <div key={emp.id} className="rounded-2xl bg-surface border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{fullName}</p>
                      <p className="text-xs text-text-secondary">{emp.job_title}</p>
                    </div>
                    {shift ? (
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${SHIFT_TIMES[shift]?.color}`}>
                        {shift}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                        No shift
                      </span>
                    )}
                  </div>

                  {/* 7-day mini calendar */}
                  <div className="grid grid-cols-7 gap-1">
                    {weekDates.map((date, i) => {
                      const dateStr = date.toISOString().split("T")[0];
                      const isOnLeave = empLeaves.has(dateStr);
                      const isToday = dateStr === new Date().toISOString().split("T")[0];
                      const isWeekend = i >= 5;

                      return (
                        <div key={i} className={`rounded-lg p-1 text-center text-xs ${
                          isOnLeave ? "bg-amber-100 text-amber-700" :
                          isToday ? "bg-primary/10 text-primary font-bold" :
                          isWeekend ? "bg-gray-50 text-text-tertiary" :
                          shift ? "bg-green-50 text-green-700" :
                          "bg-gray-50 text-text-tertiary"
                        }`}>
                          <p className="font-medium">{DAYS[i]}</p>
                          <p>{date.getDate()}</p>
                          {isOnLeave && <p className="text-amber-600" style={{ fontSize: 9 }}>LEAVE</p>}
                        </div>
                      );
                    })}
                  </div>

                  {shiftInfo && (
                    <p className="text-xs text-text-secondary">
                      Hours: {shiftInfo.start} — {shiftInfo.end}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function WeekHeader({ weekDates }: { weekDates: Date[] }) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="grid grid-cols-7 gap-1">
      {weekDates.map((date, i) => {
        const dateStr = date.toISOString().split("T")[0];
        const isToday = dateStr === today;
        return (
          <div key={i} className={`rounded-xl p-2 text-center text-xs ${isToday ? "bg-primary text-white" : "bg-surface border border-border text-text-secondary"}`}>
            <p className="font-medium">{DAYS[i]}</p>
            <p className={isToday ? "text-white/80" : "text-text-tertiary"}>{date.getDate()}</p>
          </div>
        );
      })}
    </div>
  );
}

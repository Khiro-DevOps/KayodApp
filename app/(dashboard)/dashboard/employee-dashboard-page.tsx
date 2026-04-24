import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import type { Profile, Schedule, LeaveRequest } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthDates(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // Pad start: Monday = 0
  const startPad = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad end to complete last row
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const SHIFT_COLORS: Record<string, string> = {
  morning:   "bg-amber-100 text-amber-800",
  afternoon: "bg-blue-100 text-blue-800",
  evening:   "bg-purple-100 text-purple-800",
  night:     "bg-gray-200 text-gray-700",
  custom:    "bg-teal-100 text-teal-800",
};

const SHIFT_TIMES: Record<string, string> = {
  morning:   "8:00 AM – 5:00 PM",
  afternoon: "1:00 PM – 10:00 PM",
  evening:   "5:00 PM – 2:00 AM",
  night:     "10:00 PM – 7:00 AM",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── Page ─────────────────────────────────────────────────────

export default async function EmployeeDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single<Profile & { first_name: string; last_name: string }>();

  // Non-employees fall through to the existing dashboard page logic
  if (!profile || (profile.role !== "employee")) redirect("/dashboard");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .single();

  if (!employee) redirect("/dashboard");

  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth();
  const todayStr = now.toISOString().split("T")[0];

  // Fetch this month's schedules
  const monthStart = new Date(year, month, 1).toISOString().split("T")[0];
  const monthEnd   = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const [{ data: schedules }, { data: leaves }] = await Promise.all([
    supabase
      .from("schedules")
      .select("week_start, shift, shift_start, shift_end, location, is_published")
      .eq("employee_id", employee.id)
      .gte("week_start", monthStart)
      .lte("week_start", monthEnd)
      .returns<Schedule[]>(),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, leave_type, status")
      .eq("employee_id", employee.id)
      .in("status", ["pending", "approved"])
      .gte("end_date", monthStart)
      .lte("start_date", monthEnd)
      .returns<LeaveRequest[]>(),
  ]);

  // Build a map: dateStr → { shift, isLeave, leaveStatus, isRestDay }
  type DayInfo = {
    shift: string | null;
    shiftStart: string | null;
    shiftEnd: string | null;
    isLeave: boolean;
    leaveStatus: string | null;
    leaveType: string | null;
    isRestDay: boolean;
  };

  const dayMap: Record<string, DayInfo> = {};

  // Map schedules: one row per week, applies Mon–Fri
  for (const sched of schedules ?? []) {
    const weekMonday = new Date(sched.week_start);
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekMonday);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      const isWeekend = i >= 5; // Sat/Sun = rest
      dayMap[ds] = {
        shift:       isWeekend ? null : (sched.shift ?? null),
        shiftStart:  isWeekend ? null : (sched.shift_start ?? null),
        shiftEnd:    isWeekend ? null : (sched.shift_end ?? null),
        isLeave:     false,
        leaveStatus: null,
        leaveType:   null,
        isRestDay:   isWeekend,
      };
    }
  }

  // Overlay leave days
  for (const leave of leaves ?? []) {
    const cursor = new Date(leave.start_date);
    const end    = new Date(leave.end_date);
    while (cursor <= end) {
      const ds = cursor.toISOString().split("T")[0];
      if (dayMap[ds]) {
        dayMap[ds].isLeave     = true;
        dayMap[ds].leaveStatus = leave.status;
        dayMap[ds].leaveType   = leave.leave_type;
      } else {
        dayMap[ds] = {
          shift: null, shiftStart: null, shiftEnd: null,
          isLeave: true,
          leaveStatus: leave.status,
          leaveType: leave.leave_type,
          isRestDay: false,
        };
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const monthDates = getMonthDates(year, month);

  // This week's shift (for the info card below calendar)
  const thisWeekMonday = getMonday(now).toISOString().split("T")[0];
  const thisWeekSched  = (schedules ?? []).find((s) => s.week_start === thisWeekMonday);

  // Upcoming leaves
  const upcomingLeaves = (leaves ?? [])
    .filter((l) => l.status === "approved" && new Date(l.end_date) >= now)
    .slice(0, 2);

  const firstName = profile.first_name ?? "there";

  return (
    <PageContainer>
      <div className="space-y-5">

        {/* Greeting */}
        <div>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Hey, {firstName} 👋
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* This week shift card */}
        {thisWeekSched ? (
          <div className={`rounded-2xl border p-4 ${SHIFT_COLORS[thisWeekSched.shift] ?? "bg-surface border-border"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium opacity-70 uppercase tracking-wide">This week</p>
                <p className="text-base font-semibold capitalize mt-0.5">
                  {thisWeekSched.shift} shift
                </p>
                <p className="text-sm opacity-80 mt-0.5">
                  {SHIFT_TIMES[thisWeekSched.shift] ?? `${thisWeekSched.shift_start} – ${thisWeekSched.shift_end}`}
                </p>
              </div>
              <div className="text-3xl opacity-40">
                {thisWeekSched.shift === "morning"   ? "🌅" :
                 thisWeekSched.shift === "afternoon"  ? "☀️" :
                 thisWeekSched.shift === "evening"    ? "🌆" :
                 thisWeekSched.shift === "night"      ? "🌙" : "⏰"}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-border p-4">
            <p className="text-sm text-text-secondary">No shift assigned for this week</p>
            <p className="text-xs text-text-tertiary mt-0.5">Check back or contact HR</p>
          </div>
        )}

        {/* Month calendar */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              {MONTH_NAMES[month]} {year}
            </h2>
            <Link
              href="/leaves/new"
              className="text-xs font-medium text-primary hover:underline"
            >
              + Request leave
            </Link>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((d) => (
              <p key={d} className="text-center text-xs font-medium text-text-tertiary py-1">
                {d}
              </p>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthDates.map((date, i) => {
              if (!date) {
                return <div key={`pad-${i}`} />;
              }

              const ds       = date.toISOString().split("T")[0];
              const info     = dayMap[ds];
              const isToday  = ds === todayStr;
              const dayNum   = date.getDate();

              // Determine cell style
              let cellStyle = "bg-gray-50 text-text-tertiary"; // default: no schedule
              let dotColor  = "";
              let label     = "";

              if (info?.isLeave && info.leaveStatus === "approved") {
                cellStyle = "bg-amber-100 text-amber-800";
                label     = "leave";
              } else if (info?.isLeave && info.leaveStatus === "pending") {
                cellStyle = "bg-yellow-50 text-yellow-700 border border-yellow-200";
                label     = "pending";
              } else if (info?.isRestDay) {
                cellStyle = "bg-gray-100 text-text-tertiary";
                label     = "rest";
              } else if (info?.shift) {
                const sc  = SHIFT_COLORS[info.shift] ?? "bg-green-50 text-green-800";
                cellStyle = sc;
                dotColor  = "bg-green-500";
                label     = info.shift.slice(0, 3);
              }

              if (isToday) {
                cellStyle = "bg-primary text-white ring-2 ring-primary ring-offset-1";
                label     = info?.shift?.slice(0, 3) ?? "";
              }

              return (
                <Link
                  key={ds}
                  href={`/leaves/new?date=${ds}`}
                  className={`
                    relative rounded-xl p-1.5 text-center transition-opacity hover:opacity-80
                    ${cellStyle}
                  `}
                >
                  <p className="text-xs font-semibold leading-tight">{dayNum}</p>
                  {label && (
                    <p className={`text-center leading-tight capitalize ${isToday ? "text-white/80" : ""}`} style={{ fontSize: 8 }}>
                      {label}
                    </p>
                  )}
                  {dotColor && !isToday && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`} />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-1">
            {[
              { color: "bg-amber-100", label: "Approved leave" },
              { color: "bg-yellow-50 border border-yellow-200", label: "Pending leave" },
              { color: "bg-gray-100", label: "Rest day" },
              { color: "bg-green-50", label: "Work day" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${l.color}`} />
                <span className="text-xs text-text-tertiary">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming leaves */}
        {upcomingLeaves.length > 0 && (
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">Upcoming leaves</h2>
            {upcomingLeaves.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0 border-border">
                <span className="capitalize text-text-secondary">
                  {l.leave_type.replace("_", " ")}
                </span>
                <span className="text-text-tertiary text-xs">
                  {new Date(l.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                  {" – "}
                  {new Date(l.end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Quick actions</h2>
          <QuickLink href="/leaves/new"  label="File a leave request" />
          <QuickLink href="/leaves"      label="View my leave history" />
          <QuickLink href="/schedules"   label="Full schedule view" />
          <QuickLink href="/payroll"     label="View my payslips" />
        </div>

      </div>
    </PageContainer>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
      </svg>
    </Link>
  );
}
// ============================================================
// SAVE THIS FILE AS: app/(dashboard)/schedules/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Schedule, Profile } from "@/lib/types";
import Link from "next/link";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

const SHIFT_COLORS: Record<string, string> = {
  morning:   "bg-amber-50 text-amber-700 border-amber-200",
  afternoon: "bg-blue-50 text-blue-700 border-blue-200",
  evening:   "bg-purple-50 text-purple-700 border-purple-200",
  night:     "bg-gray-100 text-gray-700 border-gray-200",
  custom:    "bg-teal-50 text-teal-700 border-teal-200",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SchedulesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Profile>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  const thisWeek = getWeekStart(new Date());
  const nextWeek = new Date(thisWeek);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const weekStartStr = thisWeek.toISOString().split("T")[0];
  const nextWeekStr  = nextWeek.toISOString().split("T")[0];

  let schedules: Schedule[] = [];

  if (isHR) {
    const { data } = await supabase
      .from("schedules")
      .select("*, employees(*, profiles(first_name, last_name))")
      .in("week_start", [weekStartStr, nextWeekStr])
      .order("week_start")
      .order("shift_start");
    schedules = (data as Schedule[]) ?? [];
  } else {
    const { data: employee } = await supabase
      .from("employees").select("id").eq("profile_id", user.id).single();

    if (!employee) redirect("/dashboard");

    const { data } = await supabase
      .from("schedules")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("is_published", true)
      .in("week_start", [weekStartStr, nextWeekStr])
      .order("week_start")
      .order("shift_start");
    schedules = (data as Schedule[]) ?? [];
  }

  const thisWeekSchedules = schedules.filter((s) => s.week_start === weekStartStr);
  const nextWeekSchedules = schedules.filter((s) => s.week_start === nextWeekStr);

  return (
    <PageContainer>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              {isHR ? "Schedules" : "My schedule"}
            </h1>
          </div>
          {isHR && (
            <Link href="/schedules/new" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
              Assign shift
            </Link>
          )}
        </div>

        <WeekSection
          title="This week"
          weekStart={thisWeek}
          schedules={thisWeekSchedules}
          isHR={isHR}
        />
        <WeekSection
          title="Next week"
          weekStart={nextWeek}
          schedules={nextWeekSchedules}
          isHR={isHR}
        />
      </div>
    </PageContainer>
  );
}

function WeekSection({
  title,
  weekStart,
  schedules,
  isHR,
}: {
  title: string;
  weekStart: Date;
  schedules: Schedule[];
  isHR: boolean;
}) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-text-tertiary">
          {weekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
          {" — "}
          {weekEnd.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
        </span>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-border p-4 text-center">
          <p className="text-sm text-text-secondary">No shifts scheduled</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => {
            const emp = schedule.employees as unknown as {
              profiles?: { first_name: string; last_name: string };
            };
            const name = emp?.profiles
              ? `${emp.profiles.first_name} ${emp.profiles.last_name}`
              : null;

            const dayDate = new Date(weekStart);
            // Show day of week based on shift_start (approximate)
            const colorClass = SHIFT_COLORS[schedule.shift] ?? SHIFT_COLORS.custom;

            return (
              <div
                key={schedule.id}
                className={`rounded-2xl border p-4 space-y-1 ${colorClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {isHR && name && (
                      <p className="text-sm font-medium">{name}</p>
                    )}
                    <p className={`text-sm font-medium capitalize ${isHR && name ? "text-xs opacity-80" : ""}`}>
                      {schedule.shift} shift
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">
                      {formatTime(schedule.shift_start)} — {formatTime(schedule.shift_end)}
                    </p>
                    {schedule.location && (
                      <p className="text-xs opacity-70">{schedule.location}</p>
                    )}
                  </div>
                </div>
                {schedule.notes && (
                  <p className="text-xs opacity-70">{schedule.notes}</p>
                )}
                {!schedule.is_published && isHR && (
                  <span className="inline-block rounded-full bg-white/50 px-2 py-0.5 text-xs font-medium">
                    Draft
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

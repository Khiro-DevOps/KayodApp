"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAndPublishEmployeeSchedule } from "./actions";
import { GlassStatTile, PageHeroHeader } from "@/components/ui/option-b-surfaces";

export type HRScheduleEmployee = {
  id: string;
  name: string;
  role: string;
  work_model: "onsite" | "wfh" | "hybrid";
  hybrid_onsite_days: string[];
  hybrid_wfh_days?: string[];
  schedule_notes?: string;
  shift_start: string;
  shift_end: string;
  lunch_start?: string;
  lunch_end?: string;
  live_status?:
    | "Working"
    | "On Lunch"
    | "On Break (1/2)"
    | "On Break (2/2)"
    | "Overbreak"
    | "Clocked Out"
    | null;
  overbreak_minutes?: number;
  leave_days?: number[];
};

type HybridDayMode = "onsite" | "wfh" | "off";

type HRSchedulesClientProps = {
  initialEmployees: HRScheduleEmployee[];
  todayDayName: string;
  pendingLeaveCount?: number;
};

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getCurrentMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export default function HRSchedulesClient({
  initialEmployees,
  todayDayName,
  pendingLeaveCount = 0,
}: HRSchedulesClientProps) {
  const [employees, setEmployees] = useState<HRScheduleEmployee[]>(initialEmployees);
  const [searchTerm, setSearchTerm] = useState("");
  const [modelFilter, setModelFilter] = useState<"All" | "Onsite" | "WFH" | "Hybrid">("All");

  const [editingEmp, setEditingEmp] = useState<HRScheduleEmployee | null>(null);
  const [weekStart, setWeekStart] = useState<string>(getCurrentMondayIso);
  const [shiftStart, setShiftStart] = useState<string>("08:00");
  const [shiftEnd, setShiftEnd] = useState<string>("17:00");
  const [lunchStart, setLunchStart] = useState<string>("12:00");
  const [lunchEnd, setLunchEnd] = useState<string>("13:00");
  const [workModel, setWorkModel] = useState<"onsite" | "wfh" | "hybrid">("onsite");
  const [workDays, setWorkDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [hybridDayModes, setHybridDayModes] = useState<Record<string, HybridDayMode>>({});
  const [notes, setNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const buildHybridModesForEmployee = (emp: HRScheduleEmployee): Record<string, HybridDayMode> => {
    const onsiteNorm = (emp.hybrid_onsite_days || []).map((d) => d.trim().toLowerCase());
    const hasExplicitWfh = Array.isArray(emp.hybrid_wfh_days);
    const wfhNorm = (emp.hybrid_wfh_days || []).map((d) => d.trim().toLowerCase());
    const map: Record<string, HybridDayMode> = {};
    DAYS_FULL.forEach((dayFull, idx) => {
      const lower = dayFull.toLowerCase();
      if (onsiteNorm.includes(lower)) {
        map[dayFull] = "onsite";
      } else if (hasExplicitWfh ? wfhNorm.includes(lower) : idx < 5) {
        map[dayFull] = "wfh";
      } else {
        map[dayFull] = "off";
      }
    });
    return map;
  };

  const openEditor = (emp: HRScheduleEmployee) => {
    setEditingEmp(emp);
    setWeekStart(getCurrentMondayIso());
    setShiftStart(emp.shift_start.slice(0, 5) || "08:00");
    setShiftEnd(emp.shift_end.slice(0, 5) || "17:00");
    setLunchStart((emp.lunch_start || "12:00").slice(0, 5));
    setLunchEnd((emp.lunch_end || "13:00").slice(0, 5));
    setWorkModel(emp.work_model);
    setWorkDays(
      emp.hybrid_onsite_days.length > 0
        ? emp.hybrid_onsite_days
        : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    );
    setHybridDayModes(buildHybridModesForEmployee(emp));
    setNotes(emp.schedule_notes || "");
  };

  const toggleWorkDay = (dayFull: string) => {
    setWorkDays((prev) =>
      prev.includes(dayFull) ? prev.filter((d) => d !== dayFull) : [...prev, dayFull]
    );
  };

  const setHybridDayMode = (dayFull: string, mode: HybridDayMode) => {
    setHybridDayModes((prev) => ({ ...prev, [dayFull]: mode }));
  };

  const handleSaveAndPublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;

    const isHybrid = workModel === "hybrid";
    const onsiteDays = isHybrid
      ? DAYS_FULL.filter((d) => hybridDayModes[d] === "onsite")
      : workDays;
    const wfhDays = isHybrid
      ? DAYS_FULL.filter((d) => hybridDayModes[d] === "wfh")
      : [];
    const combinedWorkDays = isHybrid ? [...onsiteDays, ...wfhDays] : workDays;

    startTransition(async () => {
      const res = await saveAndPublishEmployeeSchedule({
        employeeId: editingEmp.id,
        weekStart,
        shiftStart,
        shiftEnd,
        lunchStart,
        lunchEnd,
        workDays: combinedWorkDays,
        onsiteDays,
        wfhDays,
        workModel,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to publish schedule");
        return;
      }

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmp.id
            ? {
                ...emp,
                shift_start: shiftStart,
                shift_end: shiftEnd,
                lunch_start: lunchStart,
                lunch_end: lunchEnd,
                work_model: workModel,
                hybrid_onsite_days: onsiteDays,
                hybrid_wfh_days: wfhDays,
                schedule_notes: notes.trim(),
              }
            : emp
        )
      );
      toast.success(`Schedule published for ${editingEmp.name}`);
      setEditingEmp(null);
    });
  };

  const totalEmployees = employees.length;

  const getEmployeeDayMode = (emp: HRScheduleEmployee, dayIndex: number): HybridDayMode => {
    const isWeekend = dayIndex >= 5;
    const dayName = DAYS_FULL[dayIndex].toLowerCase();
    if (emp.work_model === "onsite") {
      return isWeekend ? "off" : "onsite";
    }
    if (emp.work_model === "wfh") {
      return isWeekend ? "off" : "wfh";
    }
    const onsiteNorm = (emp.hybrid_onsite_days || []).map((d) => d.trim().toLowerCase());
    if (onsiteNorm.includes(dayName)) return "onsite";
    if (Array.isArray(emp.hybrid_wfh_days)) {
      const wfhNorm = emp.hybrid_wfh_days.map((d) => d.trim().toLowerCase());
      return wfhNorm.includes(dayName) ? "wfh" : "off";
    }
    return isWeekend ? "off" : "wfh";
  };

  const todayIndex = Math.max(
    0,
    DAYS_FULL.findIndex((d) => d.toLowerCase() === todayDayName.trim().toLowerCase())
  );
  const onsiteTodayCount = employees.filter(
    (emp) => getEmployeeDayMode(emp, todayIndex) === "onsite"
  ).length;
  const wfhTodayCount = employees.filter(
    (emp) => getEmployeeDayMode(emp, todayIndex) === "wfh"
  ).length;
  const hybridTotalCount = employees.filter((emp) => emp.work_model === "hybrid").length;

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      modelFilter === "All"
        ? true
        : modelFilter === "Onsite"
        ? emp.work_model === "onsite"
        : modelFilter === "WFH"
        ? emp.work_model === "wfh"
        : emp.work_model === "hybrid";

    return matchesSearch && matchesFilter;
  });

  const renderDayBadge = (emp: HRScheduleEmployee, dayIndex: number) => {
    if (emp.leave_days?.includes(dayIndex)) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200">
          On Leave
        </span>
      );
    }

    const mode = getEmployeeDayMode(emp, dayIndex);
    if (mode === "off") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
          Off
        </span>
      );
    }
    if (mode === "onsite") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
          Onsite
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
        WFH
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <PageHeroHeader
        eyebrow="Workforce Scheduling"
        title="Schedules & Work Models"
        subtitle="Manage employee shifts, onsite days, and hybrid arrangements"
        actions={
          <Link
            href="/hr/leaves"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
              pendingLeaveCount > 0
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-indigo-100 bg-white/80 text-[#1E1B4B] backdrop-blur-md hover:bg-white"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">event_busy</span>
            <span>Pending Leave Requests ({pendingLeaveCount})</span>
          </Link>
        }
      />

      {/* Quick Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">group</span>}
          label="Total Employees"
          value={totalEmployees}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">domain</span>}
          label="Onsite Today"
          value={onsiteTodayCount}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">home</span>}
          label="WFH Today"
          value={wfhTodayCount}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">published_with_changes</span>}
          label="Hybrid Total"
          value={hybridTotalCount}
        />
      </div>

      {/* Filter and Search Bar (Frosted Glass) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-indigo-100/80 bg-white/75 p-4 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-[20px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search by employee name or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-indigo-100 bg-white pl-10 pr-4 py-2 text-xs font-medium text-text-main outline-none focus:border-[#1E1B4B]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-text-muted whitespace-nowrap">Work Model:</span>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value as "All" | "Onsite" | "WFH" | "Hybrid")}
            className="rounded-lg border border-border bg-surface-bg px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary focus:bg-card-bg"
          >
            <option value="All">All Models</option>
            <option value="Onsite">Onsite</option>
            <option value="WFH">WFH</option>
            <option value="Hybrid">Hybrid</option>
          </select>
        </div>
      </div>

      {/* Weekly Master Grid Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card-bg shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-surface-bg uppercase font-semibold text-text-muted">
            <tr>
              <th className="px-4 py-3.5">Employee Name &amp; Role</th>
              <th className="px-4 py-3.5">Work Model</th>
              <th className="px-4 py-3.5">Shift Hours</th>
              {DAYS_SHORT.map((day) => (
                <th key={day} className="px-3 py-3.5 text-center">
                  {day}
                </th>
              ))}
              <th className="px-4 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text-main">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-text-muted">
                  No employee schedules found matching criteria.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-bg/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-text-main">{emp.name}</p>
                    <p className="text-[11px] text-text-muted">{emp.role}</p>
                    {emp.live_status && (
                      <span
                        className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          emp.live_status === "Working"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : emp.live_status === "On Lunch"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : emp.live_status.startsWith("On Break")
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : emp.live_status === "Overbreak"
                                  ? "border-amber-300 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {emp.live_status}
                        {emp.live_status === "Overbreak" && (emp.overbreak_minutes ?? 0) > 0
                          ? ` (+${emp.overbreak_minutes}m)`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        emp.work_model === "onsite"
                          ? "bg-blue-100 text-blue-800"
                          : emp.work_model === "wfh"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {emp.work_model}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-medium whitespace-nowrap text-text-muted">
                    <div>{emp.shift_start} - {emp.shift_end}</div>
                    <div className="text-[10px] text-slate-500">
                      Lunch {emp.lunch_start || "12:00"}-{emp.lunch_end || "13:00"} (1h unpaid)
                    </div>
                  </td>
                  {DAYS_SHORT.map((_, dayIdx) => (
                    <td key={dayIdx} className="px-2 py-3.5 text-center whitespace-nowrap">
                      {renderDayBadge(emp, dayIdx)}
                    </td>
                  ))}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditor(emp)}
                      className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      Edit &amp; Publish
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit & Publish Schedule Modal */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Publish Weekly Schedule — {editingEmp.name}
                </h3>
                <p className="text-xs text-slate-500">{editingEmp.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveAndPublish} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Week Start (Monday)
                  </label>
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Mode
                  </label>
                  <select
                    value={workModel}
                    onChange={(e) => setWorkModel(e.target.value as "onsite" | "wfh" | "hybrid")}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  >
                    <option value="onsite">Onsite</option>
                    <option value="wfh">WFH</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shift Start
                  </label>
                  <input
                    type="time"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shift End
                  </label>
                  <input
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lunch Start (1 hr unpaid)
                  </label>
                  <input
                    type="time"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lunch End
                  </label>
                  <input
                    type="time"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {workModel === "hybrid" ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Per-Day Hybrid Assignment (Mon–Sun)
                    </label>
                    <span className="text-[11px] font-medium text-slate-500">
                      {DAYS_FULL.filter((d) => hybridDayModes[d] === "onsite").length} Onsite ·{" "}
                      {DAYS_FULL.filter((d) => hybridDayModes[d] === "wfh").length} WFH
                    </span>
                  </div>
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    {DAYS_FULL.map((dayFull, idx) => {
                      const mode = hybridDayModes[dayFull] ?? (idx < 5 ? "wfh" : "off");
                      return (
                        <div
                          key={dayFull}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 border border-slate-200/80"
                        >
                          <span className="text-xs font-semibold text-slate-800 w-24">
                            {DAYS_SHORT[idx]}
                            <span className="text-[11px] font-normal text-slate-400 ml-1">
                              ({dayFull.slice(0, 3)})
                            </span>
                          </span>
                          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 gap-0.5">
                            {(["onsite", "wfh", "off"] as const).map((opt) => {
                              const active = mode === opt;
                              const activeStyle =
                                opt === "onsite"
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : opt === "wfh"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "bg-slate-600 text-white shadow-xs";
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setHybridDayMode(dayFull, opt)}
                                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                    active
                                      ? activeStyle
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  {opt === "onsite" ? "Onsite" : opt === "wfh" ? "WFH" : "Off"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Work Days
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_FULL.map((dayFull, idx) => {
                      const active = workDays.includes(dayFull);
                      return (
                        <button
                          key={dayFull}
                          type="button"
                          onClick={() => toggleWorkDay(dayFull)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? "border-purple-600 bg-purple-600 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-300"
                          }`}
                        >
                          {DAYS_SHORT[idx]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional shift notes for employee..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? "Publishing..." : "Save & Publish Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

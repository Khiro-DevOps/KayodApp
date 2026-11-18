"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAndPublishEmployeeSchedule } from "./actions";

export type HRScheduleEmployee = {
  id: string;
  name: string;
  role: string;
  work_model: "onsite" | "wfh" | "hybrid";
  hybrid_onsite_days: string[];
  shift_start: string;
  shift_end: string;
};

type HRSchedulesClientProps = {
  initialEmployees: HRScheduleEmployee[];
  todayDayName: string;
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

export default function HRSchedulesClient({ initialEmployees, todayDayName }: HRSchedulesClientProps) {
  const [employees, setEmployees] = useState<HRScheduleEmployee[]>(initialEmployees);
  const [searchTerm, setSearchTerm] = useState("");
  const [modelFilter, setModelFilter] = useState<"All" | "Onsite" | "WFH" | "Hybrid">("All");

  const [editingEmp, setEditingEmp] = useState<HRScheduleEmployee | null>(null);
  const [weekStart, setWeekStart] = useState<string>(getCurrentMondayIso);
  const [shiftStart, setShiftStart] = useState<string>("09:00");
  const [shiftEnd, setShiftEnd] = useState<string>("18:00");
  const [workModel, setWorkModel] = useState<"onsite" | "wfh" | "hybrid">("onsite");
  const [workDays, setWorkDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [notes, setNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const openEditor = (emp: HRScheduleEmployee) => {
    setEditingEmp(emp);
    setWeekStart(getCurrentMondayIso());
    setShiftStart(emp.shift_start.slice(0, 5) || "09:00");
    setShiftEnd(emp.shift_end.slice(0, 5) || "18:00");
    setWorkModel(emp.work_model);
    setWorkDays(
      emp.hybrid_onsite_days.length > 0
        ? emp.hybrid_onsite_days
        : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    );
    setNotes("");
  };

  const toggleWorkDay = (dayFull: string) => {
    setWorkDays((prev) =>
      prev.includes(dayFull) ? prev.filter((d) => d !== dayFull) : [...prev, dayFull]
    );
  };

  const handleSaveAndPublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;

    startTransition(async () => {
      const res = await saveAndPublishEmployeeSchedule({
        employeeId: editingEmp.id,
        weekStart,
        shiftStart,
        shiftEnd,
        workDays,
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
                work_model: workModel,
                hybrid_onsite_days: workDays,
              }
            : emp
        )
      );
      toast.success(`Schedule published for ${editingEmp.name}`);
      setEditingEmp(null);
    });
  };

  const totalEmployees = employees.length;

  const isEmployeeOnsiteOnDay = (emp: HRScheduleEmployee, dayName: string) => {
    if (emp.work_model === "onsite") return true;
    if (emp.work_model === "wfh") return false;
    // Hybrid
    const normalizedDays = (emp.hybrid_onsite_days || []).map((d) => d.trim().toLowerCase());
    return normalizedDays.includes(dayName.toLowerCase());
  };

  const onsiteTodayCount = employees.filter((emp) => isEmployeeOnsiteOnDay(emp, todayDayName)).length;
  const wfhTodayCount = employees.filter((emp) => !isEmployeeOnsiteOnDay(emp, todayDayName)).length;
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
    const isWeekend = dayIndex >= 5; // Sat, Sun
    const dayName = DAYS_FULL[dayIndex];

    if (emp.work_model === "onsite") {
      if (isWeekend) {
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
            <span>🛑</span> Off
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
          <span>🏢</span> Onsite
        </span>
      );
    }

    if (emp.work_model === "wfh") {
      if (isWeekend) {
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
            <span>🛑</span> Off
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 border border-purple-200">
          <span>🏠</span> WFH
        </span>
      );
    }

    // Hybrid
    const isOnsiteDay = isEmployeeOnsiteOnDay(emp, dayName);
    if (isWeekend && !isOnsiteDay) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
          <span>🛑</span> Off
        </span>
      );
    }

    if (isOnsiteDay) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
          <span>🏢</span> Onsite
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 border border-purple-200">
        <span>🏠</span> WFH
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Schedules &amp; Work Models</h1>
          <p className="text-xs text-text-muted mt-1">
            Manage employee shifts, onsite days, and hybrid arrangements
          </p>
        </div>
      </div>

      {/* Quick Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Total Employees</span>
            <span className="material-symbols-outlined rounded-lg bg-primary-light p-2 text-primary-dark text-[20px]">
              group
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-text-main">{totalEmployees}</p>
        </div>

        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Onsite Today</span>
            <span className="material-symbols-outlined rounded-lg bg-blue-100 p-2 text-blue-700 text-[20px]">
              domain
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-blue-700">{onsiteTodayCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">WFH Today</span>
            <span className="material-symbols-outlined rounded-lg bg-purple-100 p-2 text-purple-700 text-[20px]">
              home
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-purple-700">{wfhTodayCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card-bg p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Hybrid Total</span>
            <span className="material-symbols-outlined rounded-lg bg-amber-100 p-2 text-amber-700 text-[20px]">
              published_with_changes
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-text-main">{hybridTotalCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card-bg p-4 shadow-xs">
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-[20px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search by employee name or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-bg pl-10 pr-4 py-2 text-xs font-medium text-text-main outline-none focus:border-primary focus:bg-card-bg"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-text-muted whitespace-nowrap">Work Model:</span>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value as any)}
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
                    {emp.shift_start} - {emp.shift_end}
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Work / Onsite Days
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

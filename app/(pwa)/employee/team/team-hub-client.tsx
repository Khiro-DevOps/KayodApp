"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarCheck2,
  ClipboardCheck,
  Clock,
  Home,
  Laptop,
  Mail,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { JOB_LEVEL_LABELS, type JobLevel } from "@/lib/rbac/permissions";
import { getJobLevelBadgeClasses } from "@/lib/workforce-hierarchy";
import {
  ALL_WEEK_DAYS_SHORT,
  normalizeShortWorkDays,
} from "@/lib/schedule-policy";
import {
  saveWorkModeOverrideAction,
  updateDirectReportScheduleAction,
} from "./actions";

export interface TeamDirectReport {
  id: string;
  employeeNumber: string;
  fullName: string;
  initials: string;
  email: string | null;
  jobTitle: string;
  jobLevel: JobLevel;
  workMode: "onsite" | "hybrid" | "wfh";
  todayWorkMode: "onsite" | "wfh" | "off";
  isEmergencyOverride: boolean;
  overrideReason: string | null;
  hybridOnsiteDays: string[];
  shiftStart: string;
  shiftEnd: string;
  workDays: string[];
  dailyWorkModes?: Record<string, "onsite" | "wfh" | "rest">;
  employmentStatus: string;
  departmentName: string | null;
}

type TeamSubTab = "roster" | "approvals" | "interviews";
type WorkModeFilter = "All" | "Onsite" | "Hybrid" | "WFH";

const FILTER_OPTIONS: WorkModeFilter[] = ["All", "Onsite", "Hybrid", "WFH"];

const QUICK_REASONS = [
  "Typhoon / transport disruption",
  "Urgent onsite client support",
  "Office power / network outage",
];

const DEFAULT_WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

const SHORT_DAY_MAP: Record<string, string> = {
  monday: "Mon",
  mon: "Mon",
  tuesday: "Tue",
  tue: "Tue",
  wednesday: "Wed",
  wed: "Wed",
  thursday: "Thu",
  thu: "Thu",
  friday: "Fri",
  fri: "Fri",
  saturday: "Sat",
  sat: "Sat",
  sunday: "Sun",
  sun: "Sun",
};

function formatTime12h(timeStr?: string | null): string {
  if (!timeStr) return "08:00 AM";
  const parts = timeStr.split(":");
  const hRaw = parseInt(parts[0] ?? "", 10);
  if (Number.isNaN(hRaw)) return timeStr;
  const mStr = (parts[1] ?? "00").slice(0, 2).padStart(2, "0");
  const ampm = hRaw >= 12 ? "PM" : "AM";
  const h = hRaw % 12 || 12;
  return `${h < 10 ? `0${h}` : h}:${mStr} ${ampm}`;
}

function summarizeWorkDays(workDays: string[]): string {
  const list = workDays.length > 0 ? workDays : DEFAULT_WEEK_DAYS;
  const normalized = list.map(
    (d) => SHORT_DAY_MAP[d.trim().toLowerCase()] ?? d.slice(0, 3),
  );
  if (
    normalized.length === 5 &&
    normalized[0] === "Mon" &&
    normalized[1] === "Tue" &&
    normalized[2] === "Wed" &&
    normalized[3] === "Thu" &&
    normalized[4] === "Fri"
  ) {
    return "Mon–Fri";
  }
  if (
    normalized.length === 6 &&
    normalized[0] === "Mon" &&
    normalized[5] === "Sat"
  ) {
    return "Mon–Sat";
  }
  return normalized.join(", ");
}

function formatWorkModeLabel(mode: TeamDirectReport["workMode"]): string {
  if (mode === "wfh") return "WFH";
  if (mode === "hybrid") return "Hybrid";
  return "Onsite";
}

function getWorkModeBadgeClasses(mode: TeamDirectReport["workMode"]): string {
  if (mode === "wfh") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (mode === "hybrid") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function formatTodayModeLabel(mode: TeamDirectReport["todayWorkMode"]): string {
  if (mode === "wfh") return "WFH Today";
  if (mode === "off") return "Rest Day";
  return "Onsite Today";
}

function getTodayModeBadgeClasses(
  mode: TeamDirectReport["todayWorkMode"],
): string {
  if (mode === "wfh") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (mode === "off") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function TeamHubClient({
  directReports,
  queryError = null,
  todayDateLabel = "",
}: {
  directReports: TeamDirectReport[];
  queryError?: string | null;
  todayDateLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TeamSubTab>("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<WorkModeFilter>("All");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState<"wfh" | "onsite">("wfh");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editShiftStart, setEditShiftStart] = useState("08:00");
  const [editShiftEnd, setEditShiftEnd] = useState("17:00");
  const [editDailyModes, setEditDailyModes] = useState<
    Record<string, "onsite" | "wfh" | "rest">
  >({
    Mon: "onsite",
    Tue: "onsite",
    Wed: "onsite",
    Thu: "onsite",
    Fri: "onsite",
    Sat: "rest",
    Sun: "rest",
  });

  const selectedMember = useMemo(
    () => directReports.find((m) => m.id === selectedMemberId) ?? null,
    [directReports, selectedMemberId],
  );

  const openMemberModal = (member: TeamDirectReport) => {
    setSelectedMemberId(member.id);
    setOverrideMode(member.todayWorkMode === "wfh" ? "wfh" : "onsite");
    setOverrideReason(member.overrideReason ?? "");
    setIsEditingSchedule(false);
    setEditShiftStart((member.shiftStart || "08:00").slice(0, 5));
    setEditShiftEnd((member.shiftEnd || "17:00").slice(0, 5));
    const normalizedDays = normalizeShortWorkDays(
      member.workDays.length > 0 ? member.workDays : DEFAULT_WEEK_DAYS,
    );
    const activeDays =
      normalizedDays.length > 0
        ? normalizedDays
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const hybridOnsiteNormalized = normalizeShortWorkDays(member.hybridOnsiteDays);
    const initialDaily: Record<string, "onsite" | "wfh" | "rest"> = {};
    for (const day of ALL_WEEK_DAYS_SHORT) {
      const saved = member.dailyWorkModes?.[day];
      if (saved === "onsite" || saved === "wfh" || saved === "rest") {
        initialDaily[day] = saved;
      } else if (!activeDays.includes(day)) {
        initialDaily[day] = "rest";
      } else if (member.workMode === "wfh") {
        initialDaily[day] = "wfh";
      } else if (member.workMode === "hybrid" && hybridOnsiteNormalized.length > 0) {
        initialDaily[day] = hybridOnsiteNormalized.includes(day) ? "onsite" : "wfh";
      } else {
        initialDaily[day] = "onsite";
      }
    }
    setEditDailyModes(initialDaily);
  };

  const closeMemberModal = () => {
    setSelectedMemberId(null);
    setOverrideReason("");
    setIsEditingSchedule(false);
  };

  const editWorkDays = useMemo(
    () =>
      ALL_WEEK_DAYS_SHORT.filter(
        (day) => editDailyModes[day] === "onsite" || editDailyModes[day] === "wfh",
      ),
    [editDailyModes],
  );

  const setDayMode = (day: string, mode: "onsite" | "wfh" | "rest") => {
    setEditDailyModes((prev) => ({
      ...prev,
      [day]: mode,
    }));
  };

  const setAllActiveDaysMode = (mode: "onsite" | "wfh") => {
    setEditDailyModes((prev) => {
      const next: Record<string, "onsite" | "wfh" | "rest"> = { ...prev };
      for (const day of ALL_WEEK_DAYS_SHORT) {
        if (next[day] !== "rest") {
          next[day] = mode;
        }
      }
      return next;
    });
  };

  const handleSaveSchedule = () => {
    if (!selectedMember) return;
    if (editWorkDays.length < 1) {
      toast.error("Select at least 1 working day.");
      return;
    }
    if (editWorkDays.length > 6) {
      toast.error(
        "DOLE compliance requires at least 1 rest day per week (max 6 working days).",
      );
      return;
    }

    const hasOnsite = editWorkDays.some((d) => editDailyModes[d] === "onsite");
    const hasWfh = editWorkDays.some((d) => editDailyModes[d] === "wfh");
    const derivedWorkMode: "onsite" | "wfh" | "hybrid" =
      hasOnsite && hasWfh ? "hybrid" : hasWfh ? "wfh" : "onsite";

    startTransition(async () => {
      const res = await updateDirectReportScheduleAction({
        employeeId: selectedMember.id,
        shiftStart: editShiftStart,
        shiftEnd: editShiftEnd,
        workDays: editWorkDays,
        workMode: derivedWorkMode,
        dailyWorkModes: editDailyModes,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update weekly schedule.");
        return;
      }
      toast.success(`Updated ${selectedMember.fullName}'s per-day shift & work mode roster.`);
      setIsEditingSchedule(false);
      router.refresh();
    });
  };

  const handleSaveOverride = () => {
    if (!selectedMember) return;
    if (overrideReason.trim().length < 3) {
      toast.error("Please enter a brief reason (at least 3 characters).");
      return;
    }

    const formData = new FormData();
    formData.set("employee_id", selectedMember.id);
    formData.set("override_mode", overrideMode);
    formData.set("reason", overrideReason.trim());

    startTransition(async () => {
      const res = await saveWorkModeOverrideAction(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save work mode override.");
        return;
      }
      toast.success(
        `Updated ${selectedMember.fullName}'s work mode for today to ${
          overrideMode === "wfh" ? "WFH (Emergency)" : "Onsite (Emergency)"
        }.`,
      );
      router.refresh();
    });
  };

  const handleClearOverride = () => {
    if (!selectedMember) return;

    const formData = new FormData();
    formData.set("employee_id", selectedMember.id);
    formData.set("override_mode", "clear");

    startTransition(async () => {
      const res = await saveWorkModeOverrideAction(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to clear work mode override.");
        return;
      }
      setOverrideReason("");
      toast.success(
        `Cleared emergency override for ${selectedMember.fullName}.`,
      );
      router.refresh();
    });
  };

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return directReports.filter((member) => {
      if (modeFilter !== "All") {
        if (member.workMode !== modeFilter.toLowerCase()) return false;
      }
      if (!q) return true;
      const levelLabel = JOB_LEVEL_LABELS[member.jobLevel].toLowerCase();
      return (
        member.fullName.toLowerCase().includes(q) ||
        member.jobTitle.toLowerCase().includes(q) ||
        member.employeeNumber.toLowerCase().includes(q) ||
        levelLabel.includes(q) ||
        (member.departmentName?.toLowerCase().includes(q) ?? false) ||
        (member.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [directReports, searchQuery, modeFilter]);

  return (
    <div className="space-y-5">
      {queryError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          Unable to load direct reports: {queryError}
        </div>
      ) : null}

      {/* Segmented Tab Bar (Mobile-Safe, Single Row) */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-white/80 p-1 shadow-[0_6px_24px_rgb(30,27,75,0.04)] backdrop-blur-md sm:inline-grid sm:w-auto sm:grid-cols-none sm:grid-flow-col">
        <button
          type="button"
          onClick={() => setActiveTab("roster")}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:px-4 ${
            activeTab === "roster"
              ? "bg-[#1E1B4B] text-white shadow-xs"
              : "text-[#5d5a75] hover:bg-indigo-50/60 hover:text-[#1E1B4B]"
          }`}
        >
          <span>Roster</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              activeTab === "roster"
                ? "bg-white/20 text-white"
                : "bg-indigo-100 text-[#1E1B4B]"
            }`}
          >
            {directReports.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:px-4 ${
            activeTab === "approvals"
              ? "bg-[#1E1B4B] text-white shadow-xs"
              : "text-[#5d5a75] hover:bg-indigo-50/60 hover:text-[#1E1B4B]"
          }`}
        >
          <span>Approvals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("interviews")}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:px-4 ${
            activeTab === "interviews"
              ? "bg-[#1E1B4B] text-white shadow-xs"
              : "text-[#5d5a75] hover:bg-indigo-50/60 hover:text-[#1E1B4B]"
          }`}
        >
          <span>Interviews</span>
        </button>
      </div>

      {activeTab === "roster" ? (
        <div className="space-y-4">
          {/* Search + Work Mode Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100/80 bg-white/80 p-3 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, role, ID, email, or department..."
                className="w-full rounded-xl border border-indigo-100 bg-white py-2 pl-9 pr-3 text-sm text-[#171542] placeholder:text-slate-400 focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_OPTIONS.map((option) => {
                const isSelected = modeFilter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setModeFilter(option)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-[#1E1B4B] text-white shadow-xs"
                        : "border border-slate-200/80 bg-white text-slate-600 hover:text-[#1E1B4B]"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {directReports.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-indigo-200 bg-white/80 p-10 text-center shadow-xs backdrop-blur-md">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B]">
                <Users className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#1E1B4B]">
                No Active Direct Reports
              </p>
              <p className="mt-1 text-xs text-[#5d5a75]">
                Employees assigned to report to you by HR will appear here.
              </p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-indigo-200 bg-white/80 p-10 text-center shadow-xs backdrop-blur-md">
              <p className="text-sm font-semibold text-[#1E1B4B]">
                No matching team members
              </p>
              <p className="mt-1 text-xs text-[#5d5a75]">
                Try clearing your search or switching work setup filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredReports.map((member) => {
                const shiftText = `${formatTime12h(
                  member.shiftStart,
                )} – ${formatTime12h(member.shiftEnd)}`;
                const daysSummary = summarizeWorkDays(member.workDays);

                return (
                  <div
                    key={member.id}
                    className="flex flex-col justify-between rounded-3xl border border-indigo-100/80 bg-white/85 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md transition-all hover:border-[#1E1B4B]/30 hover:shadow-md"
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EDE9F9] to-indigo-100 text-sm font-bold text-[#1E1B4B] ring-1 ring-indigo-200/70">
                            {member.initials}
                          </div>
                          <div className="min-w-0">
                            <h2 className="truncate text-sm font-semibold text-[#171542]">
                              {member.fullName}
                            </h2>
                            <p className="truncate text-xs text-[#5d5a75]">
                              {member.jobTitle}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getJobLevelBadgeClasses(
                            member.jobLevel,
                          )}`}
                        >
                          {JOB_LEVEL_LABELS[member.jobLevel]}
                        </span>
                      </div>

                      {/* Today's Effective Work Mode Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-100/80 bg-indigo-50/40 px-3 py-2">
                        <span className="text-[11px] font-semibold text-[#5d5a75]">
                          Today&apos;s Work Mode
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getTodayModeBadgeClasses(
                              member.todayWorkMode,
                            )}`}
                          >
                            {member.todayWorkMode === "wfh" ? (
                              <Home className="h-3 w-3" />
                            ) : member.todayWorkMode === "onsite" ? (
                              <Building2 className="h-3 w-3" />
                            ) : (
                              <Calendar className="h-3 w-3" />
                            )}
                            {formatTodayModeLabel(member.todayWorkMode)}
                          </span>
                          {member.isEmergencyOverride ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <ShieldAlert className="h-3 w-3" />
                              Emergency Override
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* 2x2 Structured Metadata Grid */}
                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-[#FAF9F6]/90 p-3 text-xs">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Department
                          </p>
                          <p className="truncate font-medium text-[#171542]">
                            {member.departmentName ?? "Unassigned"}
                          </p>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Contract Setup
                          </p>
                          <div>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getWorkModeBadgeClasses(
                                member.workMode,
                              )}`}
                            >
                              {member.workMode === "wfh" ? (
                                <Home className="h-3 w-3" />
                              ) : member.workMode === "hybrid" ? (
                                <Laptop className="h-3 w-3" />
                              ) : (
                                <Building2 className="h-3 w-3" />
                              )}
                              {formatWorkModeLabel(member.workMode)}
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Shift Schedule
                          </p>
                          <p className="truncate font-medium text-[#171542]">
                            {shiftText}
                          </p>
                          <p className="truncate text-[11px] text-[#5d5a75]">
                            {daysSummary}
                          </p>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            ID &amp; Email
                          </p>
                          <p className="truncate font-medium text-[#171542]">
                            {member.employeeNumber}
                          </p>
                          <p className="truncate text-[11px] text-[#5d5a75]">
                            {member.email ?? "No email"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Active
                      </span>
                      <button
                        type="button"
                        onClick={() => openMemberModal(member)}
                        className="inline-flex items-center justify-center rounded-xl border border-[#1E1B4B]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E1B4B] transition-colors hover:bg-[#1E1B4B] hover:text-white"
                      >
                        View Schedule &amp; Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "approvals" ? (
        <div className="rounded-3xl border border-indigo-100/80 bg-white/85 px-6 py-12 text-center shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B]">
            <CalendarCheck2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#171542]">
            Team Leave &amp; Undertime Approvals
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[#5d5a75]">
            Leave and undertime requests filed by your direct reports will
            appear here for your first-level review and recommendation before
            final HR sign-off.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-indigo-100/80 bg-white/85 px-6 py-12 text-center shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B]">
            <ClipboardCheck className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#171542]">
            Technical Interview Schedule
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[#5d5a75]">
            Technical interviews where you are assigned as a panelist will
            appear here with candidate details, interview times, and scorecard
            submission.
          </p>
        </div>
      )}

      {/* Centered Mobile-Safe Detail & Override Modal */}
      {selectedMember ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={closeMemberModal}
        >
          <div
            className="flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EDE9F9] to-indigo-100 text-sm font-bold text-[#1E1B4B]">
                  {selectedMember.initials}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold text-[#171542]">
                      {selectedMember.fullName}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getJobLevelBadgeClasses(
                        selectedMember.jobLevel,
                      )}`}
                    >
                      {JOB_LEVEL_LABELS[selectedMember.jobLevel]}
                    </span>
                  </div>
                  <p className="truncate text-xs text-[#5d5a75]">
                    {selectedMember.jobTitle} ·{" "}
                    {selectedMember.departmentName ?? "Unassigned"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeMemberModal}
                className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-[#FAF9F6] p-4 text-xs">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Contract Work Setup
                  </p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getWorkModeBadgeClasses(
                        selectedMember.workMode,
                      )}`}
                    >
                      {formatWorkModeLabel(selectedMember.workMode)}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Today&apos;s Work Mode
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTodayModeBadgeClasses(
                        selectedMember.todayWorkMode,
                      )}`}
                    >
                      {formatTodayModeLabel(selectedMember.todayWorkMode)}
                    </span>
                    {selectedMember.isEmergencyOverride ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Override
                      </span>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Employee ID
                  </p>
                  <p className="mt-0.5 font-semibold text-[#171542]">
                    {selectedMember.employeeNumber}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Email
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 font-medium text-[#171542]">
                    <Mail className="h-3 w-3 shrink-0 text-[#5d5a75]" />
                    <span className="truncate">
                      {selectedMember.email ?? "No email"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Shift & Weekly Schedule */}
              <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1E1B4B]">
                    <Clock className="h-4 w-4" />
                    <span>Shift &amp; Weekly Schedule</span>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setIsEditingSchedule((prev) => !prev)}
                    className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-100/70 disabled:opacity-50"
                  >
                    {isEditingSchedule ? "Cancel Edit" : "Edit Shift & Rest Days"}
                  </button>
                </div>

                {isEditingSchedule ? (
                  <div className="space-y-3 rounded-xl border border-indigo-100 bg-white p-3.5">
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-semibold text-[#171542]">
                        Quick Shift Presets
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "Morning 8AM–5PM", start: "08:00", end: "17:00" },
                          { label: "Mid 2PM–11PM", start: "14:00", end: "23:00" },
                          { label: "Graveyard 10PM–7AM", start: "22:00", end: "07:00" },
                        ].map((preset) => {
                          const isActive =
                            editShiftStart === preset.start &&
                            editShiftEnd === preset.end;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                setEditShiftStart(preset.start);
                                setEditShiftEnd(preset.end);
                              }}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                isActive
                                  ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                                  : "border-slate-200 bg-slate-50 text-[#171542] hover:bg-slate-100"
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-[#5d5a75]">
                          Shift Start
                        </span>
                        <input
                          type="time"
                          disabled={isPending}
                          value={editShiftStart}
                          onChange={(e) => setEditShiftStart(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-[#171542] focus:border-[#1E1B4B] focus:outline-none"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-[#5d5a75]">
                          Shift End
                        </span>
                        <input
                          type="time"
                          disabled={isPending}
                          value={editShiftEnd}
                          onChange={(e) => setEditShiftEnd(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-[#171542] focus:border-[#1E1B4B] focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#171542]">
                          Per-Day Work Mode &amp; Rest Days
                        </span>
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-[#1E1B4B]">
                          {editWorkDays.length} Work Days • {7 - editWorkDays.length} Rest Days
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setAllActiveDaysMode("onsite")}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-[#171542] transition-colors hover:bg-slate-100 disabled:opacity-50"
                        >
                          <Building2 className="h-3 w-3" />
                          Set All Active Days Onsite
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setAllActiveDaysMode("wfh")}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-[10px] font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <Home className="h-3 w-3" />
                          Set All Active Days WFH
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {ALL_WEEK_DAYS_SHORT.map((day) => {
                          const mode = editDailyModes[day] ?? "rest";
                          return (
                            <div
                              key={day}
                              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-2.5 py-1.5"
                            >
                              <span className="w-10 text-xs font-bold text-[#171542]">
                                {day}
                              </span>
                              <div className="grid grid-cols-3 gap-1 flex-1 max-w-[240px]">
                                {(
                                  [
                                    { value: "onsite", label: "Onsite" },
                                    { value: "wfh", label: "WFH" },
                                    { value: "rest", label: "Rest" },
                                  ] as const
                                ).map((opt) => {
                                  const active = mode === opt.value;
                                  const activeStyle =
                                    opt.value === "onsite"
                                      ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                                      : opt.value === "wfh"
                                        ? "border-indigo-600 bg-indigo-600 text-white"
                                        : "border-slate-500 bg-slate-600 text-white";
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => setDayMode(day, opt.value)}
                                      className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                        active
                                          ? activeStyle
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-[#5d5a75]">
                        Assign Onsite, WFH, or Rest per day (DOLE requires at least 1 rest day/week). Employee &amp; HR are notified with the daily split.
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setIsEditingSchedule(false)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleSaveSchedule}
                        className="rounded-xl bg-[#1E1B4B] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1E1B4B]/90 disabled:opacity-50"
                      >
                        {isPending ? "Saving..." : "Save Schedule"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5d5a75]">Shift Hours</span>
                      <span className="font-semibold text-[#171542]">
                        {formatTime12h(selectedMember.shiftStart)} –{" "}
                        {formatTime12h(selectedMember.shiftEnd)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-[#5d5a75]">
                        <Calendar className="h-3.5 w-3.5" />
                        Weekly Work Days
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedMember.workDays.length > 0
                          ? selectedMember.workDays
                          : DEFAULT_WEEK_DAYS
                        ).map((day) => (
                          <span
                            key={day}
                            className="rounded-lg border border-indigo-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E1B4B]"
                          >
                            {SHORT_DAY_MAP[day.trim().toLowerCase()] ?? day}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedMember.workMode === "hybrid" ? (
                  <div className="space-y-1.5 border-t border-indigo-100 pt-2.5">
                    <span className="text-xs text-[#5d5a75]">
                      Hybrid Onsite Days
                    </span>
                    {selectedMember.hybridOnsiteDays.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedMember.hybridOnsiteDays.map((day) => (
                          <span
                            key={day}
                            className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-800"
                          >
                            {SHORT_DAY_MAP[day.trim().toLowerCase()] ?? day}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-medium text-[#5d5a75]">
                        No fixed onsite days configured
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Emergency Work Mode Override */}
              <div className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <h4 className="text-xs font-bold text-[#171542]">
                        Emergency Work Mode Override
                      </h4>
                      <p className="text-[11px] text-[#5d5a75]">
                        Temporary override for today
                        {todayDateLabel ? ` (${todayDateLabel})` : ""} only.
                        Contract setup stays unchanged.
                      </p>
                    </div>
                  </div>
                  {selectedMember.isEmergencyOverride ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleClearOverride}
                      className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setOverrideMode("wfh")}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      overrideMode === "wfh"
                        ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                        : "border-slate-200 bg-white text-[#171542] hover:bg-slate-50"
                    }`}
                  >
                    <Home className="h-3.5 w-3.5" />
                    WFH (Emergency)
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setOverrideMode("onsite")}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      overrideMode === "onsite"
                        ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                        : "border-slate-200 bg-white text-[#171542] hover:bg-slate-50"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Onsite (Emergency)
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="override-reason-input"
                    className="block text-[11px] font-semibold text-[#171542]"
                  >
                    Reason (required)
                  </label>
                  <input
                    id="override-reason-input"
                    type="text"
                    disabled={isPending}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g., Typhoon / transport disruption"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-[#171542] placeholder:text-slate-400 focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/15"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUICK_REASONS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={isPending}
                        onClick={() => setOverrideReason(preset)}
                        className="rounded-lg border border-amber-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100/70"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3.5">
              <button
                type="button"
                disabled={isPending}
                onClick={closeMemberModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isPending || overrideReason.trim().length < 3}
                onClick={handleSaveOverride}
                className="rounded-xl bg-[#1E1B4B] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E1B4B]/90 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Override"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

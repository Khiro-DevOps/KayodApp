"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { GlassStatTile, PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import {
  createPreApprovedOvertimeAction,
  reviewAttendanceCorrectionAction,
  reviewOvertimeRequestAction,
} from "./actions";

// ─── Shared types ─────────────────────────────────────────────────────────────
export type AttendanceRow = {
  id: string;
  employeeName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  workSetup: "onsite" | "wfh" | "hybrid" | "remote" | null;
  workModel?: "onsite" | "wfh" | "off" | null;
  isToday: boolean;
  isLate: boolean;
  lateMinutes: number;
  isAbsent?: boolean;
  breakStatusLabel?:
    | "Working"
    | "On Lunch"
    | "On Break (1/2)"
    | "On Break (2/2)"
    | "Overbreak"
    | "Clocked Out"
    | null;
  overbreakMinutes?: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  distanceMeters: number | null;
  zoneStatus:
    | "onsite_verified"
    | "remote_verified"
    | "outside_zone"
    | "location_unverified";
  flagReason: string | null;
  isOvertime?: boolean;
  outsideApprovedWindow?: boolean;
};

type Metrics = {
  presentToday: number;
  lateToday: number;
  outsideZoneFlags: number;
  onLeave: number;
  absentToday: number;
};

export type HRCorrectionRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  avatarUrl: string | null;
  position: string | null;
  workSetup: "onsite" | "wfh" | "hybrid" | "remote" | null;
  workModel: "onsite" | "wfh" | "off" | null;
  targetDate: string;
  correctionType: string;
  originalClockIn: string | null;
  originalClockOut: string | null;
  requestedClockIn: string;
  requestedClockOut: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  createdAt: string;
};

export type HROvertimeRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  avatarUrl: string | null;
  position: string | null;
  workSetup: "onsite" | "wfh" | "hybrid" | "remote" | null;
  workModel: "onsite" | "wfh" | "off" | null;
  workDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  reviewNote: string | null;
  usedAt: string | null;
  createdAt: string;
};

export type HROvertimeEmployeeOption = {
  id: string;
  name: string;
  position: string | null;
};

type Props = {
  rows: AttendanceRow[];
  correctionRequests?: HRCorrectionRequestRow[];
  overtimeRequests?: HROvertimeRequestRow[];
  activeEmployees?: HROvertimeEmployeeOption[];
  todayDateStr?: string;
  metrics: Metrics;
  tenantId?: string | null;
};

// ─── Zone Badge ───────────────────────────────────────────────────────────────
function ZoneBadge({ status }: { status: AttendanceRow["zoneStatus"] }) {
  const map: Record<
    AttendanceRow["zoneStatus"],
    { label: string; cls: string; dot: string }
  > = {
    onsite_verified: {
      label: "In Zone",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      dot: "bg-emerald-500",
    },
    remote_verified: {
      label: "In Zone",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      dot: "bg-emerald-500",
    },
    outside_zone: {
      label: "Outside Zone",
      cls: "bg-rose-50 text-rose-700 border border-rose-200",
      dot: "bg-rose-500",
    },
    location_unverified: {
      label: "Unverified",
      cls: "bg-gray-100 text-gray-600 border border-gray-200",
      dot: "bg-gray-400",
    },
  };

  const { label, cls, dot } = map[status] ?? map["location_unverified"];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Work Model Badge ─────────────────────────────────────────────────────────
function WorkModelBadge({
  workModel,
  workSetup,
}: {
  workModel?: AttendanceRow["workModel"];
  workSetup: AttendanceRow["workSetup"];
}) {
  const effectiveModel =
    workModel ??
    (workSetup === "wfh" || workSetup === "remote" ? "wfh" : workSetup ? "onsite" : null);
  if (!effectiveModel) return <span className="text-text-muted text-xs">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    onsite: { label: "Onsite", cls: "bg-blue-100 text-blue-800" },
    wfh: { label: "WFH", cls: "bg-purple-100 text-purple-800" },
    off: { label: "Off", cls: "bg-slate-100 text-slate-600" },
  };
  const { label, cls } = map[effectiveModel] ?? {
    label: effectiveModel,
    cls: "bg-gray-100 text-gray-700",
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
      >
        {label}
      </span>
      {workSetup === "hybrid" && (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          Work Setup: Hybrid
        </span>
      )}
    </div>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Avatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-9 w-9 rounded-full object-cover border border-border shrink-0"
      />
    );
  }

  return (
    <div className="h-9 w-9 rounded-full bg-primary-light text-primary-dark font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
      {initials || "?"}
    </div>
  );
}

function formatPhtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main Client Component ───────────────────────────────────────────────────
export default function HRAttendanceClient({
  rows,
  correctionRequests = [],
  overtimeRequests = [],
  activeEmployees = [],
  todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  metrics,
  tenantId,
}: Props) {
  const router = useRouter();
  const hasTodayLogs = rows.some((r) => r.isToday);
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(hasTodayLogs);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showOvertimeQueue, setShowOvertimeQueue] = useState(false);
  const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({});
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [otNotesById, setOtNotesById] = useState<Record<string, string>>({});
  const [actingOtId, setActingOtId] = useState<string | null>(null);

  // Urgent Pre-Approved Overtime Modal
  const [showUrgentOtModal, setShowUrgentOtModal] = useState(false);
  const [urgentEmpId, setUrgentEmpId] = useState(activeEmployees[0]?.id ?? "");
  const [urgentWorkDate, setUrgentWorkDate] = useState(todayDateStr);
  const [urgentStartTime, setUrgentStartTime] = useState("08:00");
  const [urgentEndTime, setUrgentEndTime] = useState("17:00");
  const [urgentReason, setUrgentReason] = useState("");
  const [submittingUrgentOt, setSubmittingUrgentOt] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("hr-attendance-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_logs",
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    const fallbackInterval = todayOnly
      ? setInterval(() => {
          router.refresh();
        }, 15_000)
      : null;

    return () => {
      if (fallbackInterval) clearInterval(fallbackInterval);
      void supabase.removeChannel(channel);
    };
  }, [router, tenantId, todayOnly]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesToday = !todayOnly || r.isToday;
      const matchesSearch =
        !search ||
        r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        (r.jobTitle ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesFlagged = !flaggedOnly || r.zoneStatus === "outside_zone";

      return matchesToday && matchesSearch && matchesFlagged;
    });
  }, [rows, todayOnly, search, flaggedOnly]);

  const flaggedCount = rows.filter((r) => r.zoneStatus === "outside_zone").length;
  const pendingCorrectionCount = correctionRequests.filter((r) => r.status === "pending").length;
  const pendingOtCount = overtimeRequests.filter((r) => r.status === "pending").length;

  const filteredOvertime = useMemo(() => {
    if (!search.trim()) return overtimeRequests;
    const q = search.toLowerCase();
    return overtimeRequests.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        (r.position ?? "").toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
    );
  }, [overtimeRequests, search]);

  const handleReviewOvertime = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    setActingOtId(requestId);
    const res = await reviewOvertimeRequestAction({
      requestId,
      decision,
      reviewNote: otNotesById[requestId] ?? "",
    });
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      router.refresh();
    }
    setActingOtId(null);
  };

  const handleCreateUrgentOt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUrgentOt(true);
    const res = await createPreApprovedOvertimeAction({
      employeeId: urgentEmpId,
      workDate: urgentWorkDate,
      startTime: urgentStartTime,
      endTime: urgentEndTime,
      reason: urgentReason,
    });
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setShowUrgentOtModal(false);
      setUrgentReason("");
      router.refresh();
    }
    setSubmittingUrgentOt(false);
  };

  const filteredCorrections = useMemo(() => {
    if (!search.trim()) return correctionRequests;
    const q = search.toLowerCase();
    return correctionRequests.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        (r.position ?? "").toLowerCase().includes(q) ||
        r.correctionType.toLowerCase().includes(q)
    );
  }, [correctionRequests, search]);

  const handleReviewCorrection = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    setActingRequestId(requestId);
    const res = await reviewAttendanceCorrectionAction({
      requestId,
      decision,
      reviewNotes: reviewNotesById[requestId] ?? "",
    });
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      router.refresh();
    }
    setActingRequestId(null);
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <PageHeroHeader
        eyebrow="Live Operations"
        title="Attendance Operations"
        subtitle="Monitor clock-ins, geofence flags, and zone status — last 30 days"
        actions={
          <div className="flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#1E1B4B] shadow-xs backdrop-blur-md">
            <span className="material-symbols-outlined text-[16px] text-[#1E1B4B]">
              update
            </span>
            Live attendance data
          </div>
        }
      />

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">how_to_reg</span>}
          label="Present Today"
          value={metrics.presentToday}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">schedule</span>}
          label="Late Today"
          value={metrics.lateToday}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">person_off</span>}
          label="Absent Today"
          value={metrics.absentToday}
          badge={
            metrics.absentToday > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Alert
              </span>
            ) : undefined
          }
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">location_off</span>}
          label="Outside Zone Flags"
          value={metrics.outsideZoneFlags}
          badge={
            metrics.outsideZoneFlags > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Flagged
              </span>
            ) : undefined
          }
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">beach_access</span>}
          label="On Leave"
          value={metrics.onLeave}
        />
      </div>

      {/* ── Filter / Search Bar (Frosted Glass) ──────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-100/80 bg-white/75 p-4 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-[20px]">
            search
          </span>
          <input
            id="attendance-search"
            type="text"
            placeholder="Search employee name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-indigo-100 bg-white pl-10 pr-4 py-2 text-xs font-medium text-text-main outline-none focus:border-[#1E1B4B] transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Today / All (30d) Quick Toggle */}
          <div className="inline-flex rounded-xl border border-border bg-surface-bg p-0.5">
            <button
              type="button"
              onClick={() => setTodayOnly(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                todayOnly
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTodayOnly(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                !todayOnly
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              All (30d)
            </button>
          </div>

          {/* Overtime Requests Toggle */}
          <button
            id="attendance-overtime-toggle"
            type="button"
            onClick={() => setShowOvertimeQueue((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
              showOvertimeQueue
                ? "border-[#1E1B4B] bg-[#1E1B4B] text-white shadow-sm"
                : "border-indigo-200 bg-indigo-50/70 text-[#1E1B4B] hover:bg-indigo-100"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">more_time</span>
            Overtime Requests
            {pendingOtCount > 0 && (
              <span
                className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  showOvertimeQueue
                    ? "bg-amber-400 text-slate-900"
                    : "bg-[#1E1B4B] text-white"
                }`}
              >
                {pendingOtCount > 99 ? "99+" : pendingOtCount}
              </span>
            )}
          </button>

          {/* Assign Urgent Overtime CTA */}
          <button
            type="button"
            onClick={() => {
              if (!urgentEmpId && activeEmployees[0]?.id) {
                setUrgentEmpId(activeEmployees[0].id);
              }
              setShowUrgentOtModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2d2b68] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Assign Urgent Overtime
          </button>

          {/* Correction Requests Toggle */}
          <button
            id="attendance-corrections-toggle"
            type="button"
            onClick={() => setShowCorrections((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
              showCorrections
                ? "border-[#1E1B4B] bg-[#1E1B4B] text-white shadow-sm"
                : "border-indigo-200 bg-indigo-50/70 text-[#1E1B4B] hover:bg-indigo-100"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
            Correction Requests
            {pendingCorrectionCount > 0 && (
              <span
                className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  showCorrections
                    ? "bg-amber-400 text-slate-900"
                    : "bg-[#1E1B4B] text-white"
                }`}
              >
                {pendingCorrectionCount > 99 ? "99+" : pendingCorrectionCount}
              </span>
            )}
          </button>

          {/* Flagged Toggle */}
          <button
            id="attendance-flagged-toggle"
            type="button"
            onClick={() => setFlaggedOnly((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
              flaggedOnly
                ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm ring-1 ring-rose-300"
                : "border-border bg-surface-bg text-text-muted hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {flaggedOnly ? "filter_alt_off" : "filter_alt"}
            </span>
            {flaggedOnly ? "Showing Flagged Only" : "Show Flagged Only"}
            {flaggedCount > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {flaggedCount > 99 ? "99+" : flaggedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Overtime Requests Review Queue ─────────────────────────────────── */}
      {(showOvertimeQueue || pendingOtCount > 0) && (
        <SolidSurfaceCard className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#1E1B4B]">Overtime Requests</h2>
                {pendingOtCount > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {pendingOtCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Approve or decline rest-day overtime passes before employees can clock in.
              </p>
            </div>
            {!showOvertimeQueue && overtimeRequests.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOvertimeQueue(true)}
                className="text-xs font-semibold text-[#1E1B4B] hover:underline self-start sm:self-center"
              >
                View all ({overtimeRequests.length})
              </button>
            )}
          </div>

          {filteredOvertime.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-muted">
              No overtime requests match your current filter.
            </p>
          ) : (
            <div className="space-y-3">
              {(showOvertimeQueue
                ? filteredOvertime
                : filteredOvertime.filter((r) => r.status === "pending")
              ).map((ot) => {
                const isBusy = actingOtId === ot.id;
                return (
                  <div
                    key={ot.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={ot.employeeName} src={ot.avatarUrl} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{ot.employeeName}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                ot.status === "pending"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : ot.status === "approved"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : ot.status === "rejected"
                                      ? "border-rose-200 bg-rose-50 text-rose-700"
                                      : "border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {ot.status}
                            </span>
                            {ot.usedAt && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-[#1E1B4B]">
                                Used
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            {ot.position && <span className="font-medium">{ot.position}</span>}
                            <span>·</span>
                            <span className="font-semibold text-slate-800">Date: {ot.workDate}</span>
                            <span>·</span>
                            <span className="font-semibold text-[#1E1B4B]">
                              {ot.startTime.slice(0, 5)} – {ot.endTime.slice(0, 5)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <WorkModelBadge workModel={ot.workModel} workSetup={ot.workSetup} />
                    </div>

                    <p className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Reason:</span> {ot.reason}
                    </p>

                    {ot.status === "pending" ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                        <input
                          type="text"
                          value={otNotesById[ot.id] ?? ""}
                          onChange={(e) =>
                            setOtNotesById((prev) => ({
                              ...prev,
                              [ot.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional review note..."
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1E1B4B] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReviewOvertime(ot.id, "rejected")}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                          >
                            {isBusy ? "Saving..." : "Reject"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReviewOvertime(ot.id, "approved")}
                            className="rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                          >
                            {isBusy ? "Approving..." : "Approve"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      ot.reviewNote && (
                        <p className="text-[11px] text-slate-600 italic">
                          HR note: {ot.reviewNote}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SolidSurfaceCard>
      )}

      {/* ── Attendance Correction Requests Review Queue ─────────────────────── */}
      {(showCorrections || pendingCorrectionCount > 0) && (
        <SolidSurfaceCard className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#1E1B4B]">
                  Attendance Correction Requests
                </h2>
                {pendingCorrectionCount > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {pendingCorrectionCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Review employee clock-in/out correction requests and apply approved changes to attendance logs.
              </p>
            </div>
            {!showCorrections && correctionRequests.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCorrections(true)}
                className="text-xs font-semibold text-[#1E1B4B] hover:underline self-start sm:self-center"
              >
                View all ({correctionRequests.length})
              </button>
            )}
          </div>

          {filteredCorrections.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-muted">
              No attendance correction requests match your current filter.
            </p>
          ) : (
            <div className="space-y-3">
              {(showCorrections
                ? filteredCorrections
                : filteredCorrections.filter((r) => r.status === "pending")
              ).map((req) => {
                const isBusy = actingRequestId === req.id;
                return (
                  <div
                    key={req.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={req.employeeName} src={req.avatarUrl} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">
                              {req.employeeName}
                            </p>
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-[#1E1B4B]">
                              {req.correctionType}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                req.status === "pending"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : req.status === "approved"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            {req.position && <span className="font-medium">{req.position}</span>}
                            <span>·</span>
                            <span className="font-semibold text-slate-800">Date: {req.targetDate}</span>
                          </div>
                        </div>
                      </div>

                      <WorkModelBadge workModel={req.workModel} workSetup={req.workSetup} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Original Timestamps
                        </p>
                        <p className="mt-1 font-medium text-slate-700">
                          In: {formatPhtTime(req.originalClockIn)} · Out:{" "}
                          {formatPhtTime(req.originalClockOut)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E1B4B]">
                          Requested Timestamps
                        </p>
                        <p className="mt-1 font-bold text-[#1E1B4B]">
                          In: {formatPhtTime(req.requestedClockIn)} · Out:{" "}
                          {formatPhtTime(req.requestedClockOut)}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Reason:</span> {req.reason}
                    </p>

                    {req.status === "pending" ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                        <input
                          type="text"
                          value={reviewNotesById[req.id] ?? ""}
                          onChange={(e) =>
                            setReviewNotesById((prev) => ({
                              ...prev,
                              [req.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional reviewer note..."
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#1E1B4B] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReviewCorrection(req.id, "rejected")}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                          >
                            {isBusy ? "Saving..." : "Reject"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReviewCorrection(req.id, "approved")}
                            className="rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                          >
                            {isBusy ? "Applying..." : "Approve & Apply"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      req.reviewNotes && (
                        <p className="text-[11px] text-slate-600 italic">
                          Reviewer note: {req.reviewNotes}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SolidSurfaceCard>
      )}

      {/* ── Attendance Log Table ─────────────────────────────────────────────── */}
      <SolidSurfaceCard className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-surface-bg">
            <tr>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Employee
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Date
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Clock In
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Clock Out
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Break / Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Work Model
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Distance (m)
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Zone Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Flag Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text-main">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-14 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[40px] text-text-muted opacity-40">
                      {flaggedOnly ? "location_off" : "history"}
                    </span>
                    <p className="text-sm font-medium text-text-muted">
                      {flaggedOnly
                        ? "No flagged entries found."
                        : search
                        ? "No attendance logs match your search."
                        : "No attendance logs in the last 30 days."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`group transition-colors hover:bg-surface-bg/60 ${
                    row.zoneStatus === "outside_zone"
                      ? "bg-rose-50/30 hover:bg-rose-50/60"
                      : ""
                  }`}
                >
                  {/* Employee */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.employeeName} src={row.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-text-main whitespace-normal break-words leading-relaxed">
                          {row.employeeName}
                        </p>
                        {row.jobTitle && (
                          <p className="text-[11px] text-text-muted whitespace-normal break-words leading-relaxed">
                            {row.jobTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-text-muted">
                    {row.date}
                  </td>

                  {/* Clock In */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.isAbsent ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                        Absent
                      </span>
                    ) : row.clockIn ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-text-main">
                          {row.clockIn}
                        </span>
                        {row.isOvertime ? (
                          <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-[#1E1B4B]">
                            Overtime
                          </span>
                        ) : row.isLate ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Late (+{row.lateMinutes}m)
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            On Time
                          </span>
                        )}
                        {row.outsideApprovedWindow && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            Outside Window
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Clock Out */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.isAbsent ? (
                      <span className="text-text-muted">—</span>
                    ) : row.clockOut ? (
                      <span className="font-medium text-text-main">
                        {row.clockOut}
                      </span>
                    ) : (
                      <span className="text-text-muted italic text-[11px]">
                        In progress
                      </span>
                    )}
                  </td>

                  {/* Break / Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.breakStatusLabel ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                            row.breakStatusLabel === "Working"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.breakStatusLabel === "On Lunch"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : row.breakStatusLabel.startsWith("On Break")
                                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                  : row.breakStatusLabel === "Overbreak"
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.breakStatusLabel}
                        </span>
                        {(row.overbreakMinutes ?? 0) > 0 ? (
                          <span className="text-[10px] font-medium text-amber-700">
                            +{row.overbreakMinutes}m overbreak
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Work Model */}
                  <td className="px-4 py-3.5">
                    <WorkModelBadge workModel={row.workModel} workSetup={row.workSetup} />
                  </td>

                  {/* Distance */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.distanceMeters != null ? (
                      <span
                        className={`font-medium ${
                          row.zoneStatus === "outside_zone"
                            ? "text-rose-600"
                            : "text-text-main"
                        }`}
                      >
                        {Math.round(row.distanceMeters).toLocaleString()}m
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Zone Status Badge */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <ZoneBadge status={row.zoneStatus} />
                  </td>

                  {/* Flag Reason */}
                  <td className="px-4 py-3.5">
                    {row.flagReason ? (
                      <span
                        className="block whitespace-normal break-words text-rose-700 font-medium italic leading-relaxed"
                        title={row.flagReason}
                      >
                        {row.flagReason}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer row count */}
        {filtered.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-[11px] text-text-muted flex items-center justify-between">
            <span>
              Showing{" "}
              <span className="font-semibold text-text-main">
                {filtered.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-text-main">{rows.length}</span>{" "}
              records
            </span>
            {flaggedOnly && (
              <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                <span className="material-symbols-outlined text-[13px]">
                  filter_alt
                </span>
                Flagged filter active
              </span>
            )}
          </div>
        )}
      </SolidSurfaceCard>

      {/* Assign Urgent Pre-Approved Overtime Modal */}
      {showUrgentOtModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#1E1B4B]">Assign Urgent Overtime</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Issue a pre-approved rest-day overtime pass for an employee.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUrgentOtModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateUrgentOt} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Employee
                </label>
                <select
                  required
                  value={urgentEmpId}
                  onChange={(e) => setUrgentEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                >
                  <option value="" disabled>
                    Select employee...
                  </option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.position ? ` — ${emp.position}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Date
                </label>
                <input
                  type="date"
                  required
                  value={urgentWorkDate}
                  onChange={(e) => setUrgentWorkDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={urgentStartTime}
                    onChange={(e) => setUrgentStartTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={urgentEndTime}
                    onChange={(e) => setUrgentEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={urgentReason}
                  onChange={(e) => setUrgentReason(e.target.value)}
                  placeholder="Urgent coverage reason..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrgentOtModal(false)}
                  disabled={submittingUrgentOt}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUrgentOt || !urgentEmpId || urgentReason.trim().length < 5}
                  className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                >
                  {submittingUrgentOt ? "Issuing..." : "Issue Approved OT Pass"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

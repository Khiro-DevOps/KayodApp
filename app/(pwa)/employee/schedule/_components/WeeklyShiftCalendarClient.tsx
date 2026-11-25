"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ApplyUndertimeModal from "@/components/undertime/ApplyUndertimeModal";
import { cancelUndertimeRequestAction } from "@/app/actions/undertime";
import {
  computeLeaveOffsetDays,
  formatTime12h,
  formatUndertimeTypeLabel,
  type UndertimeRequestSummary,
} from "@/lib/undertime";

export interface WeeklyShiftRow {
  dateStr: string;
  dayShort: string;
  dayNumber: number;
  isToday: boolean;
  isPast: boolean;
  isOff: boolean;
  isOnsite: boolean;
  leaveType: string | null;
  shiftTitle: string;
  statusLabel: string;
  statusStyle: string;
  formattedShiftRange: string;
  scheduledOut: string;
}

interface WeeklyShiftCalendarClientProps {
  weekRangeLabel: string;
  isSchedulePublished: boolean;
  todayDateStr: string;
  shiftStart: string;
  shiftEnd: string;
  hasSupervisor: boolean;
  availableVlCredits?: number;
  weekDays: WeeklyShiftRow[];
  initialUndertimeRequests: UndertimeRequestSummary[];
}

function getEffectiveWindowLabel(
  req: UndertimeRequestSummary,
  fallbackIn: string
): string {
  const effIn = req.requested_in ?? req.scheduled_in ?? fallbackIn;
  const effOut = req.requested_out ?? req.scheduled_out;
  return `${formatTime12h(effIn)} – ${formatTime12h(effOut)}`;
}

function getUndertimeBadge(req: UndertimeRequestSummary) {
  if (req.status === "pending_supervisor") {
    return {
      label: `Pending Supervisor (${req.undertime_minutes}m)`,
      cls: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (req.status === "pending_hr") {
    return {
      label: `Pending HR (${req.undertime_minutes}m)`,
      cls: "border-indigo-200 bg-indigo-50 text-indigo-700",
    };
  }
  if (req.status === "approved") {
    if (req.undertime_type === "late_in" && req.requested_in) {
      return {
        label: `Approved In: ${formatTime12h(req.requested_in)}`,
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    if (
      req.undertime_type === "half_day_first" ||
      req.undertime_type === "half_day_second"
    ) {
      return {
        label: `Approved ${formatUndertimeTypeLabel(req.undertime_type)}`,
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    return {
      label: `Approved Out: ${formatTime12h(req.requested_out)}`,
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (req.status === "rejected") {
    return {
      label: "Undertime Rejected",
      cls: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  return {
    label: "Cancelled",
    cls: "border-slate-200 bg-slate-100 text-slate-600",
  };
}

export function ApplyUndertimeHeaderButton({
  todayDateStr,
  shiftStart,
  shiftEnd,
  hasSupervisor,
  availableVlCredits = 0,
}: {
  todayDateStr: string;
  shiftStart: string;
  shiftEnd: string;
  hasSupervisor: boolean;
  availableVlCredits?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">schedule_send</span>
        Apply for Undertime
      </button>

      <ApplyUndertimeModal
        isOpen={open}
        onClose={() => setOpen(false)}
        initialWorkDate={todayDateStr}
        scheduledOut={shiftEnd}
        shiftStart={shiftStart}
        hasSupervisor={hasSupervisor}
        availableVlCredits={availableVlCredits}
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}

export default function WeeklyShiftCalendarClient({
  weekRangeLabel,
  isSchedulePublished,
  todayDateStr,
  shiftStart,
  shiftEnd,
  hasSupervisor,
  availableVlCredits = 0,
  weekDays,
  initialUndertimeRequests,
}: WeeklyShiftCalendarClientProps) {
  const router = useRouter();
  const [undertimeRequests, setUndertimeRequests] = useState<
    UndertimeRequestSummary[]
  >(initialUndertimeRequests);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(todayDateStr);
  const [modalScheduledOut, setModalScheduledOut] = useState(shiftEnd);
  const [lockModalDate, setLockModalDate] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const openModalForDate = (
    dateStr: string,
    scheduledOut: string,
    lock: boolean
  ) => {
    setModalDate(dateStr);
    setModalScheduledOut(scheduledOut);
    setLockModalDate(lock);
    setModalOpen(true);
  };

  const getActiveOrLatestUndertimeForDate = (dateStr: string) => {
    const matches = undertimeRequests.filter((r) => r.work_date === dateStr);
    return (
      matches.find((r) =>
        ["pending_supervisor", "pending_hr", "approved"].includes(r.status)
      ) ??
      matches[0] ??
      null
    );
  };

  const handleCancel = async (requestId: string) => {
    setCancellingId(requestId);
    try {
      const res = await cancelUndertimeRequestAction(requestId);
      if (!res.success) {
        toast.error(res.error ?? "Failed to cancel undertime request.");
        return;
      }
      setUndertimeRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "cancelled" } : r))
      );
      toast.success(res.message ?? "Undertime request cancelled.");
      router.refresh();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Personal Weekly Shift Calendar */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_12px_rgba(39,36,84,0.06)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <p className="text-xs text-text-secondary font-medium">{weekRangeLabel}</p>
        </div>

        {/* 7-Day interactive strip (Mon - Sun) */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className={`flex flex-col items-center rounded-xl py-2.5 text-center text-xs transition-colors ${
                day.isToday
                  ? "bg-[#1e1b4b] text-white shadow-sm ring-2 ring-[#1e1b4b]/20"
                  : day.leaveType
                    ? "bg-amber-50 border border-amber-200 text-amber-800"
                    : day.isOff
                      ? "bg-[#f7f6fc] border border-[#e6e4f0] text-text-secondary opacity-75"
                      : day.isOnsite
                        ? "bg-indigo-50 border border-indigo-200 text-indigo-800"
                        : "bg-emerald-50 border border-emerald-200 text-emerald-800"
              }`}
            >
              <span className="font-semibold">{day.dayShort}</span>
              <span
                className={`mt-0.5 text-[11px] ${
                  day.isToday ? "text-white/80" : "opacity-75"
                }`}
              >
                {day.dayNumber}
              </span>
              <span
                className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  day.isToday
                    ? day.isOff
                      ? "bg-white/15 text-white"
                      : day.isOnsite
                        ? "bg-indigo-500/40 text-white"
                        : "bg-emerald-500/40 text-white"
                    : ""
                }`}
              >
                {day.leaveType
                  ? "On Leave"
                  : day.isOff
                    ? "Off"
                    : day.isOnsite
                      ? "Onsite"
                      : "WFH"}
              </span>
            </div>
          ))}
        </div>

        {/* Detailed Day-by-Day Shift Cards */}
        <div className="space-y-2 pt-2">
          {weekDays.map((day) => {
            const utReq = getActiveOrLatestUndertimeForDate(day.dateStr);
            const hasActiveUt =
              utReq !== null &&
              ["pending_supervisor", "pending_hr", "approved"].includes(
                utReq.status
              );
            const utBadge = utReq ? getUndertimeBadge(utReq) : null;
            const canRequestUndertime = !day.isOff && !day.leaveType && !hasActiveUt;

            return (
              <div
                key={day.dateStr}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                  day.isToday
                    ? "border-slate-300 bg-slate-50 shadow-sm"
                    : "border-[#e6e4f0] bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center rounded-xl bg-[#f7f6fc] border border-[#e6e4f0] w-12 h-12 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                      {day.dayShort}
                    </span>
                    <span className="text-base font-extrabold text-text-primary leading-tight">
                      {day.dayNumber}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-text-primary">
                        {day.shiftTitle}
                      </p>
                      {!day.isOff && !day.leaveType && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            day.isOnsite
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {day.isOnsite ? "Onsite" : "WFH"}
                        </span>
                      )}
                      {utBadge && utReq?.status !== "cancelled" && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${utBadge.cls}`}
                        >
                          {utBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary font-medium">
                      {day.leaveType
                        ? "Approved Leave"
                        : day.isOff
                          ? "Scheduled Rest Day"
                          : day.formattedShiftRange}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canRequestUndertime && (
                    <button
                      type="button"
                      onClick={() =>
                        openModalForDate(day.dateStr, day.scheduledOut, true)
                      }
                      className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#1E1B4B] hover:bg-indigo-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        schedule_send
                      </span>
                      Request Undertime
                    </button>
                  )}
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${day.statusStyle}`}
                  >
                    {day.statusLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* My Undertime Requests List */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_12px_rgba(39,36,84,0.06)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              My Undertime Requests
            </p>
            <p className="text-[11px] text-slate-500">
              Track supervisor sign-off and HR verification. Available VL:{" "}
              <span className="font-semibold text-slate-700">
                {availableVlCredits.toFixed(2)} days
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => openModalForDate(todayDateStr, shiftEnd, false)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-[#1E1B4B] transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            New Request
          </button>
        </div>

        {undertimeRequests.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-500">
            No undertime requests filed yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {undertimeRequests.map((req) => {
              const badge = getUndertimeBadge(req);
              const offsetDays =
                req.leave_credits_deducted > 0
                  ? req.leave_credits_deducted
                  : computeLeaveOffsetDays(req.undertime_minutes);
              return (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        {req.work_date}
                      </span>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-[#1E1B4B]">
                        {formatUndertimeTypeLabel(req.undertime_type)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {req.deduction_mode === "leave_offset"
                          ? `VL Offset (-${offsetDays.toFixed(2)}d)`
                          : "Payroll Deduction"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Work Window: {getEffectiveWindowLabel(req, shiftStart)} ·{" "}
                      {req.undertime_minutes} mins
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Reason: {req.reason}
                    </p>
                    {req.coverage_notes && (
                      <p className="text-[11px] text-slate-500">
                        Coverage: {req.coverage_notes}
                      </p>
                    )}
                    {req.rejection_reason && (
                      <p className="text-[11px] font-medium text-rose-600">
                        Rejection note: {req.rejection_reason}
                      </p>
                    )}
                  </div>

                  {req.status === "pending_supervisor" && (
                    <button
                      type="button"
                      disabled={cancellingId === req.id}
                      onClick={() => handleCancel(req.id)}
                      className="self-start sm:self-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                    >
                      {cancellingId === req.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ApplyUndertimeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialWorkDate={modalDate}
        scheduledOut={modalScheduledOut}
        shiftStart={shiftStart}
        hasSupervisor={hasSupervisor}
        availableVlCredits={availableVlCredits}
        lockWorkDate={lockModalDate}
        onSubmitted={(created) => {
          setUndertimeRequests((prev) => [created, ...prev]);
          router.refresh();
        }}
      />
    </div>
  );
}

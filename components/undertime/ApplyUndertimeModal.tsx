"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { submitUndertimeRequestAction } from "@/app/actions/undertime";
import {
  computeLeaveOffsetDays,
  computeUndertimeWindow,
  formatTime12h,
  normalizeTimeHm,
  type UndertimeDeductionMode,
  type UndertimeRequestSummary,
  type UndertimeType,
} from "@/lib/undertime";

export interface ApplyUndertimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWorkDate: string;
  scheduledOut: string;
  shiftStart?: string;
  hasSupervisor?: boolean;
  availableVlCredits?: number;
  lockWorkDate?: boolean;
  onSubmitted?: (request: UndertimeRequestSummary) => void;
}

type RequestCategory = "early_out" | "late_in" | "half_day";

function shiftTimeByMinutes(hm: string, deltaMinutes: number): string {
  const parts = hm.split(":");
  const h = Number.parseInt(parts[0] ?? "8", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "16:00";
  const total = ((h * 60 + m + deltaMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

export default function ApplyUndertimeModal({
  isOpen,
  onClose,
  initialWorkDate,
  scheduledOut,
  shiftStart = "08:00",
  hasSupervisor = true,
  availableVlCredits = 0,
  lockWorkDate = false,
  onSubmitted,
}: ApplyUndertimeModalProps) {
  const lockedShiftIn = normalizeTimeHm(shiftStart || "08:00");
  const lockedShiftOut = normalizeTimeHm(scheduledOut || "17:00");

  const [workDate, setWorkDate] = useState(initialWorkDate);
  const [category, setCategory] = useState<RequestCategory>("early_out");
  const [halfDayChoice, setHalfDayChoice] = useState<
    "half_day_first" | "half_day_second"
  >("half_day_first");
  const [requestedOut, setRequestedOut] = useState(() =>
    shiftTimeByMinutes(lockedShiftOut, -60)
  );
  const [requestedIn, setRequestedIn] = useState(() =>
    shiftTimeByMinutes(lockedShiftIn, 120)
  );
  const [deductionMode, setDeductionMode] =
    useState<UndertimeDeductionMode>("payroll_deduction");
  const [reason, setReason] = useState("");
  const [coverageNotes, setCoverageNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setWorkDate(initialWorkDate);
    setCategory("early_out");
    setHalfDayChoice("half_day_first");
    setRequestedOut(shiftTimeByMinutes(lockedShiftOut, -60));
    setRequestedIn(shiftTimeByMinutes(lockedShiftIn, 120));
    setDeductionMode("payroll_deduction");
    setReason("");
    setCoverageNotes("");
  }, [isOpen, initialWorkDate, lockedShiftIn, lockedShiftOut]);

  const undertimeType: UndertimeType =
    category === "half_day" ? halfDayChoice : category;

  const firstHalfPreview = useMemo(
    () =>
      computeUndertimeWindow({
        scheduledIn: lockedShiftIn,
        scheduledOut: lockedShiftOut,
        undertimeType: "half_day_first",
      }),
    [lockedShiftIn, lockedShiftOut]
  );

  const secondHalfPreview = useMemo(
    () =>
      computeUndertimeWindow({
        scheduledIn: lockedShiftIn,
        scheduledOut: lockedShiftOut,
        undertimeType: "half_day_second",
      }),
    [lockedShiftIn, lockedShiftOut]
  );

  const calc = useMemo(
    () =>
      computeUndertimeWindow({
        scheduledIn: lockedShiftIn,
        scheduledOut: lockedShiftOut,
        undertimeType,
        requestedOut,
        requestedIn,
      }),
    [lockedShiftIn, lockedShiftOut, undertimeType, requestedOut, requestedIn]
  );

  const requiredVlDays = computeLeaveOffsetDays(calc.undertimeMinutes);
  const insufficientVl =
    deductionMode === "leave_offset" &&
    calc.valid &&
    availableVlCredits + 1e-6 < requiredVlDays;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calc.valid) {
      toast.error(calc.error ?? "Invalid undertime window.");
      return;
    }
    if (insufficientVl) {
      toast.error(
        `Insufficient Vacation Leave balance (need ${requiredVlDays.toFixed(
          2
        )} days, have ${availableVlCredits.toFixed(2)} days).`
      );
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Please provide a reason (at least 5 characters).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitUndertimeRequestAction({
        workDate,
        undertimeType,
        requestedOut: undertimeType === "early_out" ? requestedOut : undefined,
        requestedIn: undertimeType === "late_in" ? requestedIn : undefined,
        reason: reason.trim(),
        coverageNotes: coverageNotes.trim() || undefined,
        deductionMode,
      });

      if (!res.success) {
        toast.error(res.error ?? "Failed to submit undertime request.");
        return;
      }

      toast.success(res.message ?? "Undertime request submitted.");
      if (res.request && onSubmitted) {
        onSubmitted(res.request);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const hours = Math.floor(calc.undertimeMinutes / 60);
  const mins = calc.undertimeMinutes % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#1E1B4B]">
              Apply for Undertime / Half-Day
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {hasSupervisor
                ? "Routes to your immediate supervisor for operational sign-off, then HR for payroll or VL offset logging."
                : "Routes directly to HR for verification and payroll or VL offset logging."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Work Date + Assigned Shift Pill */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Date
              </label>
              <input
                type="date"
                required
                readOnly={lockWorkDate}
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className={`w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none ${
                  lockWorkDate
                    ? "bg-slate-100 text-slate-600 cursor-not-allowed"
                    : "bg-white"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Shift
              </label>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                <span>
                  {formatTime12h(lockedShiftIn)} – {formatTime12h(lockedShiftOut)}
                </span>
                <span className="material-symbols-outlined text-[14px] text-slate-400">
                  lock
                </span>
              </div>
            </div>
          </div>

          {/* 3-Button Request Type Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Request Type
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
              {(
                [
                  { id: "early_out", label: "Early Out" },
                  { id: "late_in", label: "Late Arrival" },
                  { id: "half_day", label: "Half-Day" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCategory(opt.id)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all ${
                    category === opt.id
                      ? "bg-[#1E1B4B] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional Time Picker / Half-Day Cards */}
          {category === "early_out" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requested Out Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={requestedOut}
                  onChange={(e) => setRequestedOut(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deduction Mode
                </label>
                <select
                  value={deductionMode}
                  onChange={(e) =>
                    setDeductionMode(e.target.value as UndertimeDeductionMode)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                >
                  <option value="payroll_deduction">Payroll Deduction (Pro-rata)</option>
                  <option value="leave_offset">Leave Credit Offset (VL)</option>
                </select>
              </div>
            </div>
          )}

          {category === "late_in" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requested Arrival Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={requestedIn}
                  onChange={(e) => setRequestedIn(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deduction Mode
                </label>
                <select
                  value={deductionMode}
                  onChange={(e) =>
                    setDeductionMode(e.target.value as UndertimeDeductionMode)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                >
                  <option value="payroll_deduction">Payroll Deduction (Pro-rata)</option>
                  <option value="leave_offset">Leave Credit Offset (VL)</option>
                </select>
              </div>
            </div>
          )}

          {category === "half_day" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setHalfDayChoice("half_day_first")}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    halfDayChoice === "half_day_first"
                      ? "border-[#1E1B4B] bg-indigo-50/80 ring-1 ring-[#1E1B4B]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-bold text-[#1E1B4B]">1st Half Off</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Work 2nd Half:{" "}
                    <span className="font-semibold text-slate-900">
                      {formatTime12h(firstHalfPreview.effectiveIn)} –{" "}
                      {formatTime12h(firstHalfPreview.effectiveOut)}
                    </span>{" "}
                    • 4h 00m
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setHalfDayChoice("half_day_second")}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    halfDayChoice === "half_day_second"
                      ? "border-[#1E1B4B] bg-indigo-50/80 ring-1 ring-[#1E1B4B]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-bold text-[#1E1B4B]">2nd Half Off</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Work 1st Half:{" "}
                    <span className="font-semibold text-slate-900">
                      {formatTime12h(secondHalfPreview.effectiveIn)} –{" "}
                      {formatTime12h(secondHalfPreview.effectiveOut)}
                    </span>{" "}
                    • 4h 00m
                  </p>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deduction Mode
                </label>
                <select
                  value={deductionMode}
                  onChange={(e) =>
                    setDeductionMode(e.target.value as UndertimeDeductionMode)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                >
                  <option value="payroll_deduction">Payroll Deduction (Pro-rata)</option>
                  <option value="leave_offset">Leave Credit Offset (VL)</option>
                </select>
              </div>
            </div>
          )}

          {/* Summary Bar */}
          <div
            className={`rounded-xl border px-3 py-2.5 text-xs space-y-1 ${
              !calc.valid || insufficientVl
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-indigo-200 bg-indigo-50 text-[#1E1B4B]"
            }`}
          >
            {calc.valid ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Effective Work Window</span>
                  <span className="font-bold">
                    {formatTime12h(calc.effectiveIn)} –{" "}
                    {formatTime12h(calc.effectiveOut)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Calculated Undertime</span>
                  <span className="font-bold">
                    {calc.undertimeMinutes} mins ({hours > 0 ? `${hours}h ` : ""}
                    {mins}m)
                  </span>
                </div>
                {deductionMode === "leave_offset" && (
                  <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-indigo-200/60">
                    <span className="font-semibold">VL Offset</span>
                    <span className="font-bold">
                      -{requiredVlDays.toFixed(3)} days (Available:{" "}
                      {availableVlCredits.toFixed(2)} days)
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="font-medium">{calc.error}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              minLength={5}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Medical appointment, urgent family errand..."
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-[#1E1B4B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Coverage / Handover Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={coverageNotes}
              onChange={(e) => setCoverageNotes(e.target.value)}
              placeholder="Note any tasks handed over or teammate covering for your immediate supervisor..."
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-[#1E1B4B] focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !calc.valid ||
                insufficientVl ||
                reason.trim().length < 5
              }
              className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Undertime Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

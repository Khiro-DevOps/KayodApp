"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, FileCheck2, Send } from "lucide-react";
import { fileLeaveRequest } from "../actions";

export interface LeaveBalanceOptionSummary {
  vlAvailable: number;
  slAvailable: number;
  silAvailable: number;
  hasVl: boolean;
  hasSl: boolean;
  hasSil: boolean;
}

interface LeaveRequestFormProps {
  prefillDate?: string;
  balances: LeaveBalanceOptionSummary;
  isProbationary: boolean;
  eligibilityMap: Record<string, string>;
}

function computeWorkingDaysInclusive(startStr: string, endStr: string): {
  workingDays: number;
  calendarDays: number;
  invalid: boolean;
} {
  if (!startStr || !endStr) {
    return { workingDays: 0, calendarDays: 0, invalid: false };
  }
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { workingDays: 0, calendarDays: 0, invalid: true };
  }
  if (end < start) {
    return { workingDays: 0, calendarDays: 0, invalid: true };
  }

  let workingDays = 0;
  let calendarDays = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= end && calendarDays < 366) {
    calendarDays += 1;
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { workingDays, calendarDays, invalid: false };
}

export default function LeaveRequestForm({
  prefillDate = "",
  balances,
  isProbationary,
  eligibilityMap,
}: LeaveRequestFormProps) {
  const todayIso = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [startDate, setStartDate] = useState<string>(prefillDate || "");
  const [endDate, setEndDate] = useState<string>(prefillDate || "");

  const dayStats = useMemo(
    () => computeWorkingDaysInclusive(startDate, endDate),
    [startDate, endDate]
  );

  const leaveOptions = useMemo(
    () => [
      {
        value: "vacation",
        label: balances.hasVl
          ? `Vacation Leave (VL) — ${balances.vlAvailable}d available`
          : "Vacation Leave (VL)",
      },
      {
        value: "sick",
        label: balances.hasSl
          ? `Sick Leave (SL) — ${balances.slAvailable}d available`
          : "Sick Leave (SL)",
      },
      {
        value: "sil",
        label: balances.hasSil
          ? `Service Incentive Leave (SIL) — ${balances.silAvailable}d available`
          : "Service Incentive Leave (SIL)",
      },
      {
        value: "maternity",
        label: "Maternity Leave (Statutory · Doc Verification)",
      },
      {
        value: "paternity",
        label: "Paternity Leave (Statutory · Doc Verification)",
      },
      {
        value: "solo_parent",
        label: "Solo Parent Leave (Statutory · Doc Verification)",
      },
      {
        value: "vawc",
        label: "VAWC Leave (Statutory · Doc Verification)",
      },
      {
        value: "magna_carta",
        label: "Magna Carta Leave (Statutory · Doc Verification)",
      },
      {
        value: "unpaid",
        label: "Unpaid Leave (LWOP)",
      },
    ],
    [balances]
  );

  const selectedPoolWarning = useMemo(() => {
    const ledgerKey =
      leaveType === "vacation"
        ? "VL"
        : leaveType === "sick"
          ? "SL"
          : leaveType === "sil"
            ? "SIL"
            : null;
    if (!ledgerKey) return null;

    if (isProbationary && eligibilityMap[ledgerKey] === "upon_regularization") {
      return `${ledgerKey} credits become usable upon regularization. You are currently in your probationary period.`;
    }

    const available =
      ledgerKey === "VL"
        ? balances.vlAvailable
        : ledgerKey === "SL"
          ? balances.slAvailable
          : balances.silAvailable;
    const hasPool =
      ledgerKey === "VL"
        ? balances.hasVl
        : ledgerKey === "SL"
          ? balances.hasSl
          : balances.hasSil;

    if (hasPool && dayStats.calendarDays > 0 && dayStats.calendarDays > available) {
      return `Requested range (${dayStats.calendarDays}d) exceeds your available ${ledgerKey} balance (${available}d).`;
    }
    return null;
  }, [leaveType, isProbationary, eligibilityMap, balances, dayStats.calendarDays]);

  const isStatutory = [
    "maternity",
    "paternity",
    "solo_parent",
    "vawc",
    "magna_carta",
  ].includes(leaveType);

  return (
    <form
      action={fileLeaveRequest}
      className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5"
    >
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-base font-bold text-slate-900">Leave Request Details</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Select your leave type, dates, and optional context for your reviewer.
        </p>
      </div>

      {/* Leave Type Selector */}
      <div className="space-y-1.5">
        <label
          htmlFor="leave_type"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          Leave Type <span className="text-rose-500">*</span>
        </label>
        <select
          id="leave_type"
          name="leave_type"
          required
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/10"
        >
          {leaveOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date Range + Live Computed Working Days Badge */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="start_date"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              Start Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="start_date"
              type="date"
              name="start_date"
              required
              value={startDate}
              min={todayIso}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                if (!endDate || endDate < next) {
                  setEndDate(next);
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/10"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="end_date"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
            >
              End Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="end_date"
              type="date"
              name="end_date"
              required
              value={endDate}
              min={startDate || todayIso}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/10"
            />
          </div>
        </div>

        {/* Live Computed Working Days Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-900">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <span>Computed Working Days</span>
          </div>
          {dayStats.invalid ? (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              End date must be on or after start date
            </span>
          ) : dayStats.calendarDays > 0 ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#1E1B4B] px-3 py-0.5 text-xs font-bold text-white">
                {dayStats.workingDays} working day{dayStats.workingDays === 1 ? "" : "s"}
              </span>
              {dayStats.calendarDays !== dayStats.workingDays && (
                <span className="text-[11px] text-indigo-700">
                  ({dayStats.calendarDays} calendar day{dayStats.calendarDays === 1 ? "" : "s"})
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Select dates to calculate
            </span>
          )}
        </div>
      </div>

      {selectedPoolWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
          {selectedPoolWarning}
        </div>
      )}

      {isStatutory && (
        <div className="flex items-start gap-2.5 rounded-xl border border-purple-200 bg-purple-50/70 px-3.5 py-2.5 text-xs text-purple-900">
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
          <p>
            <strong>Statutory Special Leave:</strong> Does not deduct from your VL/SL credit
            pool. Your request will be tagged for HR document verification.
          </p>
        </div>
      )}

      {/* Reason */}
      <div className="space-y-1.5">
        <label
          htmlFor="reason"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          Reason <span className="font-normal normal-case text-slate-400">(optional)</span>
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          placeholder="Add a brief note or coverage plan for your supervisor and HR..."
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/10"
        />
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={dayStats.invalid}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E1B4B] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2A2566] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Submit Leave Request
        </button>
      </div>
    </form>
  );
}

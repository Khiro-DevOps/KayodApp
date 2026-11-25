export type UndertimeStatus =
  | "pending_supervisor"
  | "pending_hr"
  | "approved"
  | "rejected"
  | "cancelled";

export type UndertimeDeductionMode = "payroll_deduction" | "leave_offset";

export type UndertimeType =
  | "early_out"
  | "late_in"
  | "half_day_first"
  | "half_day_second";

export interface UndertimeRequestSummary {
  id: string;
  work_date: string;
  undertime_type: UndertimeType;
  scheduled_in: string | null;
  scheduled_out: string;
  requested_in: string | null;
  requested_out: string | null;
  undertime_minutes: number;
  leave_credits_deducted: number;
  reason: string;
  coverage_notes: string | null;
  deduction_mode: UndertimeDeductionMode;
  status: UndertimeStatus;
  supervisor_acted_at: string | null;
  hr_acted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface UndertimeCalculationResult {
  valid: boolean;
  undertimeMinutes: number;
  error?: string;
}

export interface UndertimeWindowInput {
  scheduledIn: string;
  scheduledOut: string;
  undertimeType: UndertimeType;
  requestedOut?: string | null;
  requestedIn?: string | null;
}

export interface UndertimeWindowResult {
  valid: boolean;
  undertimeMinutes: number;
  scheduledIn: string;
  scheduledOut: string;
  effectiveIn: string;
  effectiveOut: string;
  error?: string;
}

function parseHmMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(":");
  if (parts.length < 2) return null;
  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

function minutesToHm(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const m = String(wrapped % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Computes effective work window and lunch-aware undertime minutes for:
 * - `early_out`: works [scheduledIn, requestedOut]
 * - `late_in`: works [requestedIn, scheduledOut]
 * - `half_day_first`: off first 4h + 1h meal break; works [scheduledIn + 5h, scheduledOut] (240m)
 * - `half_day_second`: works [scheduledIn, scheduledIn + 4h]; off meal break + 2nd half (240m)
 */
export function computeUndertimeWindow(
  input: UndertimeWindowInput
): UndertimeWindowResult {
  const startMin = parseHmMinutes(input.scheduledIn);
  const rawEndMin = parseHmMinutes(input.scheduledOut);

  if (startMin === null || rawEndMin === null) {
    return {
      valid: false,
      undertimeMinutes: 0,
      scheduledIn: normalizeTimeHm(input.scheduledIn),
      scheduledOut: normalizeTimeHm(input.scheduledOut),
      effectiveIn: normalizeTimeHm(input.scheduledIn),
      effectiveOut: normalizeTimeHm(input.scheduledOut),
      error: "Please provide valid shift start and end times.",
    };
  }

  const endMin = rawEndMin <= startMin ? rawEndMin + 1440 : rawEndMin;
  const mealStart = startMin + 240;
  const mealEnd = startMin + 300;
  const scheduledInHm = minutesToHm(startMin);
  const scheduledOutHm = minutesToHm(endMin);

  if (input.undertimeType === "half_day_first") {
    const effIn = Math.min(mealEnd, endMin);
    return {
      valid: true,
      undertimeMinutes: 240,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: minutesToHm(effIn),
      effectiveOut: scheduledOutHm,
    };
  }

  if (input.undertimeType === "half_day_second") {
    const effOut = Math.min(mealStart, endMin);
    return {
      valid: true,
      undertimeMinutes: 240,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: scheduledInHm,
      effectiveOut: minutesToHm(effOut),
    };
  }

  if (input.undertimeType === "late_in") {
    const rawReqIn = parseHmMinutes(input.requestedIn);
    if (rawReqIn === null) {
      return {
        valid: false,
        undertimeMinutes: 0,
        scheduledIn: scheduledInHm,
        scheduledOut: scheduledOutHm,
        effectiveIn: scheduledInHm,
        effectiveOut: scheduledOutHm,
        error: "Please enter a valid requested arrival time.",
      };
    }

    const reqIn =
      rawEndMin <= startMin && rawReqIn <= startMin ? rawReqIn + 1440 : rawReqIn;
    if (reqIn <= startMin) {
      return {
        valid: false,
        undertimeMinutes: 0,
        scheduledIn: scheduledInHm,
        scheduledOut: scheduledOutHm,
        effectiveIn: minutesToHm(reqIn),
        effectiveOut: scheduledOutHm,
        error: "Requested arrival time must be after your scheduled shift start.",
      };
    }
    if (reqIn >= endMin) {
      return {
        valid: false,
        undertimeMinutes: 0,
        scheduledIn: scheduledInHm,
        scheduledOut: scheduledOutHm,
        effectiveIn: minutesToHm(reqIn),
        effectiveOut: scheduledOutHm,
        error: "Requested arrival time must be before your scheduled shift end.",
      };
    }

    const rawGap = reqIn - startMin;
    const mealOverlap = overlapMinutes(startMin, reqIn, mealStart, mealEnd);
    const undertimeMinutes = rawGap - mealOverlap;

    if (undertimeMinutes <= 0 || undertimeMinutes >= 480) {
      return {
        valid: false,
        undertimeMinutes,
        scheduledIn: scheduledInHm,
        scheduledOut: scheduledOutHm,
        effectiveIn: minutesToHm(reqIn),
        effectiveOut: scheduledOutHm,
        error:
          "Undertime must be between 1 and 479 minutes (< 8 hours). File a leave request for full-day absences.",
      };
    }

    return {
      valid: true,
      undertimeMinutes,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: minutesToHm(reqIn),
      effectiveOut: scheduledOutHm,
    };
  }

  // Default: early_out
  const rawReqOut = parseHmMinutes(input.requestedOut);
  if (rawReqOut === null) {
    return {
      valid: false,
      undertimeMinutes: 0,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: scheduledInHm,
      effectiveOut: scheduledOutHm,
      error: "Please enter a valid requested out time.",
    };
  }

  const reqOut =
    rawEndMin <= startMin && rawReqOut <= startMin ? rawReqOut + 1440 : rawReqOut;
  if (reqOut >= endMin) {
    return {
      valid: false,
      undertimeMinutes: 0,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: scheduledInHm,
      effectiveOut: minutesToHm(reqOut),
      error: "Requested out time must be earlier than your scheduled out time.",
    };
  }
  if (reqOut <= startMin) {
    return {
      valid: false,
      undertimeMinutes: 0,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: scheduledInHm,
      effectiveOut: minutesToHm(reqOut),
      error: "Requested out time must be after your scheduled shift start.",
    };
  }

  const rawGap = endMin - reqOut;
  const mealOverlap = overlapMinutes(reqOut, endMin, mealStart, mealEnd);
  const undertimeMinutes = rawGap - mealOverlap;

  if (undertimeMinutes <= 0 || undertimeMinutes >= 480) {
    return {
      valid: false,
      undertimeMinutes,
      scheduledIn: scheduledInHm,
      scheduledOut: scheduledOutHm,
      effectiveIn: scheduledInHm,
      effectiveOut: minutesToHm(reqOut),
      error:
        "Undertime must be between 1 and 479 minutes (< 8 hours). File a leave request for full-day absences.",
    };
  }

  return {
    valid: true,
    undertimeMinutes,
    scheduledIn: scheduledInHm,
    scheduledOut: scheduledOutHm,
    effectiveIn: scheduledInHm,
    effectiveOut: minutesToHm(reqOut),
  };
}

/**
 * Legacy helper for early-out calculation (used by existing tests/callers).
 */
export function computeUndertimeMinutes(
  scheduledOut: string,
  requestedOut: string,
  shiftStart?: string | null
): UndertimeCalculationResult {
  const schedMin = parseHmMinutes(scheduledOut);
  const reqMin = parseHmMinutes(requestedOut);

  if (schedMin === null || reqMin === null) {
    return {
      valid: false,
      undertimeMinutes: 0,
      error: "Please enter valid HH:MM times.",
    };
  }

  const startMin = parseHmMinutes(shiftStart);
  let diff = 0;

  if (startMin !== null) {
    const isOvernight = schedMin <= startMin;
    const normSched = isOvernight ? schedMin + 1440 : schedMin;
    const normReq = isOvernight && reqMin <= startMin ? reqMin + 1440 : reqMin;
    diff = normSched - normReq;
  } else if (reqMin <= schedMin) {
    diff = schedMin - reqMin;
  } else {
    const crossMidnightDiff = schedMin + 1440 - reqMin;
    diff =
      crossMidnightDiff > 0 && crossMidnightDiff < 480
        ? crossMidnightDiff
        : schedMin - reqMin;
  }

  if (diff <= 0) {
    return {
      valid: false,
      undertimeMinutes: 0,
      error: "Requested out time must be earlier than your scheduled out time.",
    };
  }

  if (diff >= 480) {
    return {
      valid: false,
      undertimeMinutes: diff,
      error:
        "Undertime must be less than a full 8-hour shift (< 480 minutes). File a leave request for full-day absences.",
    };
  }

  return {
    valid: true,
    undertimeMinutes: diff,
  };
}

export function computeLeaveOffsetDays(undertimeMinutes: number): number {
  if (!Number.isFinite(undertimeMinutes) || undertimeMinutes <= 0) return 0;
  return Number((undertimeMinutes / 480).toFixed(4));
}

export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const parts = String(timeStr).trim().split(":");
  const hParsed = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(hParsed)) return String(timeStr);
  const h24 = ((hParsed % 24) + 24) % 24;
  const mParsed = Number.parseInt(parts[1] ?? "0", 10);
  const mStr = Number.isFinite(mParsed)
    ? String(Math.max(0, Math.min(59, mParsed))).padStart(2, "0")
    : "00";
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${mStr} ${period}`;
}

export function formatUndertimeTime12h(timeStr: string | null | undefined): string {
  return formatTime12h(timeStr);
}

export function normalizeTimeHm(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const parts = String(timeStr).trim().split(":");
  const h = (parts[0] ?? "00").padStart(2, "0");
  const m = (parts[1] ?? "00").slice(0, 2).padStart(2, "0");
  return `${h}:${m}`;
}

export function getTodayPhtIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getTodayPhtDayShort(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
  }).format(now);
}

export function isTodayPht(dateStr: string, now: Date = new Date()): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === getTodayPhtIso(now);
}

export function formatUndertimeTypeLabel(type?: UndertimeType | null): string {
  switch (type) {
    case "late_in":
      return "Late Arrival";
    case "half_day_first":
      return "Half-Day (1st Half Off)";
    case "half_day_second":
      return "Half-Day (2nd Half Off)";
    case "early_out":
    default:
      return "Early Out";
  }
}

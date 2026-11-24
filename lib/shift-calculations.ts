/**
 * Rotating & Overnight Shift Calculations (Asia/Manila PHT, UTC+8)
 *
 * Cleanly handles cross-midnight shifts (e.g. Graveyard 22:00–07:00) without
 * negative duration bugs, computing:
 * - Total worked minutes / hours
 * - Late minutes (with optional grace period)
 * - Undertime minutes
 * - Night Shift Differential (NSD) minutes/hours worked between 22:00 and 06:00 PHT (10% PH Labor Code)
 */

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShiftCalculationInput {
  clockIn: string | Date;
  clockOut?: string | Date | null;
  shiftStart: string | null | undefined; // e.g. "22:00" or "22:00:00"
  shiftEnd: string | null | undefined;   // e.g. "07:00" or "07:00:00"
  gracePeriodMinutes?: number;
  unpaidBreakMinutes?: number;
}

export interface ShiftCalculationResult {
  isOvernightShift: boolean;
  shiftStartUtcMs: number;
  shiftEndUtcMs: number;
  scheduledDurationMinutes: number;
  workedMinutes: number;
  workedHours: number;
  lateMinutes: number;
  isLate: boolean;
  undertimeMinutes: number;
  nightDiffMinutes: number;
  nightDiffHours: number;
}

export function parseTimeHm(
  hm: string | null | undefined,
  fallbackH: number,
  fallbackM: number
): [number, number] {
  const parts = String(hm ?? "").trim().split(":");
  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  return [
    Number.isFinite(h) && h >= 0 && h <= 23 ? h : fallbackH,
    Number.isFinite(m) && m >= 0 && m <= 59 ? m : fallbackM,
  ];
}

export function toPhtDateString(ms: number): string {
  const d = new Date(ms + PHT_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function phtDateHmToUtcMs(
  dateIso: string,
  hour: number,
  minute: number
): number {
  const baseUtc = Date.parse(`${dateIso}T00:00:00Z`);
  return baseUtc - PHT_OFFSET_MS + (hour * 60 + minute) * 60_000;
}

function shiftDateIso(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolves the exact scheduled [shiftStartUtcMs, shiftEndUtcMs] window for a given clock-in timestamp.
 * For overnight shifts (e.g., 22:00–07:00), if an employee clocks in at 00:15 (after midnight),
 * the shift started on the previous PHT calendar day at 22:00!
 */
export function resolveShiftWindowForClockIn(
  clockInMs: number,
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined
): {
  isOvernightShift: boolean;
  shiftStartUtcMs: number;
  shiftEndUtcMs: number;
  scheduledDurationMinutes: number;
} {
  const [startH, startM] = parseTimeHm(shiftStart, 8, 0);
  const [endH, endM] = parseTimeHm(shiftEnd, 17, 0);
  const startTotalMin = startH * 60 + startM;
  const endTotalMin = endH * 60 + endM;
  const isOvernightShift = endTotalMin <= startTotalMin;

  const phtDate = toPhtDateString(clockInMs);
  let shiftStartUtcMs = phtDateHmToUtcMs(phtDate, startH, startM);
  let shiftEndUtcMs = phtDateHmToUtcMs(phtDate, endH, endM);

  if (isOvernightShift) {
    shiftEndUtcMs += DAY_MS;

    // If clocking in early morning (e.g. 00:30 for a 22:00–07:00 shift),
    // check whether previous day's shift window is closer to clockInMs.
    const prevShiftStart = shiftStartUtcMs - DAY_MS;
    const prevShiftEnd = shiftEndUtcMs - DAY_MS;
    if (clockInMs <= prevShiftEnd + 2 * 60 * 60_000 && Math.abs(clockInMs - prevShiftStart) < Math.abs(clockInMs - shiftStartUtcMs)) {
      shiftStartUtcMs = prevShiftStart;
      shiftEndUtcMs = prevShiftEnd;
    }
  }

  const scheduledDurationMinutes = Math.max(
    0,
    Math.round((shiftEndUtcMs - shiftStartUtcMs) / 60_000)
  );

  return {
    isOvernightShift,
    shiftStartUtcMs,
    shiftEndUtcMs,
    scheduledDurationMinutes,
  };
}

/**
 * Computes Night Shift Differential (NSD) minutes overlapping 22:00–06:00 PHT
 * across any single or multi-day span.
 */
export function computeNsdMinutes(clockInMs: number, clockOutMs: number): number {
  if (!Number.isFinite(clockInMs) || !Number.isFinite(clockOutMs) || clockOutMs <= clockInMs) {
    return 0;
  }

  const startIso = shiftDateIso(toPhtDateString(clockInMs), -1);
  const endIso = toPhtDateString(clockOutMs);

  let totalMinutes = 0;
  let cursorIso = startIso;
  let safety = 0;

  while (cursorIso <= endIso && safety < 14) {
    const winStartMs = phtDateHmToUtcMs(cursorIso, 22, 0);
    const winEndMs = winStartMs + 8 * 60 * 60_000; // 06:00 next day PHT

    const overlapStart = Math.max(clockInMs, winStartMs);
    const overlapEnd = Math.min(clockOutMs, winEndMs);
    if (overlapEnd > overlapStart) {
      totalMinutes += Math.floor((overlapEnd - overlapStart) / 60_000);
    }

    cursorIso = shiftDateIso(cursorIso, 1);
    safety += 1;
  }

  return totalMinutes;
}

/**
 * Computes late minutes, undertime minutes, worked hours, and 10% NSD minutes/hours
 * for any fixed, rotating, or overnight shift.
 */
export function calculateShiftAttendanceMetrics(
  input: ShiftCalculationInput
): ShiftCalculationResult {
  const clockInMs =
    input.clockIn instanceof Date
      ? input.clockIn.getTime()
      : Date.parse(input.clockIn);
  const clockOutMs =
    input.clockOut == null
      ? null
      : input.clockOut instanceof Date
        ? input.clockOut.getTime()
        : Date.parse(input.clockOut);

  const graceMinutes = Math.max(0, input.gracePeriodMinutes ?? 5);
  const unpaidBreakMinutes = Math.max(0, input.unpaidBreakMinutes ?? 0);

  const {
    isOvernightShift,
    shiftStartUtcMs,
    shiftEndUtcMs,
    scheduledDurationMinutes,
  } = resolveShiftWindowForClockIn(clockInMs, input.shiftStart, input.shiftEnd);

  // Late calculation
  const rawLateMinutes = Math.floor((clockInMs - shiftStartUtcMs) / 60_000);
  const lateMinutes =
    rawLateMinutes > graceMinutes ? Math.min(scheduledDurationMinutes || 480, rawLateMinutes) : 0;

  if (clockOutMs == null || Number.isNaN(clockOutMs) || clockOutMs <= clockInMs) {
    return {
      isOvernightShift,
      shiftStartUtcMs,
      shiftEndUtcMs,
      scheduledDurationMinutes,
      workedMinutes: 0,
      workedHours: 0,
      lateMinutes,
      isLate: lateMinutes > 0,
      undertimeMinutes: 0,
      nightDiffMinutes: 0,
      nightDiffHours: 0,
    };
  }

  const rawElapsedMinutes = Math.max(0, Math.floor((clockOutMs - clockInMs) / 60_000));
  const workedMinutes = Math.max(0, rawElapsedMinutes - unpaidBreakMinutes);
  const workedHours = Math.round((workedMinutes / 60) * 100) / 100;

  // Undertime: clocking out earlier than scheduled shift end
  const rawUndertime = Math.floor((shiftEndUtcMs - clockOutMs) / 60_000);
  const undertimeMinutes = rawUndertime > 0 ? Math.min(scheduledDurationMinutes || 480, rawUndertime) : 0;

  const nightDiffMinutes = computeNsdMinutes(clockInMs, clockOutMs);
  const nightDiffHours = Math.round((nightDiffMinutes / 60) * 100) / 100;

  return {
    isOvernightShift,
    shiftStartUtcMs,
    shiftEndUtcMs,
    scheduledDurationMinutes,
    workedMinutes,
    workedHours,
    lateMinutes,
    isLate: lateMinutes > 0,
    undertimeMinutes,
    nightDiffMinutes,
    nightDiffHours,
  };
}

export interface OvertimeWindowValidation {
  valid: boolean;
  crossesMidnight: boolean;
  durationMinutes: number;
  durationHours: number;
  error?: string;
}

/**
 * Computes overtime window duration, supporting cross-midnight shifts (e.g. 20:00 -> 05:00).
 * Rolls end_time forward +1 calendar day when end <= start; rejects 0-minute or >16h windows.
 */
export function computeOvertimeWindowMinutes(
  startTime: string,
  endTime: string
): OvertimeWindowValidation {
  const cleanStart = String(startTime ?? "").trim();
  const cleanEnd = String(endTime ?? "").trim();
  if (!cleanStart || !cleanEnd) {
    return {
      valid: false,
      crossesMidnight: false,
      durationMinutes: 0,
      durationHours: 0,
      error: "Start time and end time are required.",
    };
  }

  const [startH, startM] = parseTimeHm(cleanStart, -1, -1);
  const [endH, endM] = parseTimeHm(cleanEnd, -1, -1);
  if (startH < 0 || startM < 0 || endH < 0 || endM < 0) {
    return {
      valid: false,
      crossesMidnight: false,
      durationMinutes: 0,
      durationHours: 0,
      error: "Invalid time format.",
    };
  }

  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;
  if (startTotal === endTotal) {
    return {
      valid: false,
      crossesMidnight: false,
      durationMinutes: 0,
      durationHours: 0,
      error: "End time cannot be the same as start time (0 minutes).",
    };
  }

  let crossesMidnight = false;
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
    crossesMidnight = true;
  }

  const durationMinutes = endTotal - startTotal;
  if (durationMinutes > 16 * 60) {
    return {
      valid: false,
      crossesMidnight,
      durationMinutes,
      durationHours: Math.round((durationMinutes / 60) * 100) / 100,
      error: "Overtime duration cannot exceed 16 hours in a single request.",
    };
  }

  return {
    valid: true,
    crossesMidnight,
    durationMinutes,
    durationHours: Math.round((durationMinutes / 60) * 100) / 100,
  };
}

export type OvertimeType = "regular_ot" | "rdot";

export interface ValidateOvertimeInput {
  workDate: string;
  startTime: string;
  endTime: string;
  requestedType?: OvertimeType | null;
  workDays?: string[] | null;
  dailyWorkModes?: Record<string, string | null | undefined> | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

export interface ValidateOvertimeResult {
  valid: boolean;
  isRestDay: boolean;
  resolvedType: OvertimeType;
  dayShort: string;
  crossesMidnight: boolean;
  durationMinutes: number;
  durationHours: number;
  error?: string;
}

const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_FULL_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function normalizeShortWeekdayToken(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const idx = WEEKDAY_SHORT_NAMES.findIndex((s) => s.toLowerCase() === lower.slice(0, 3));
  return idx >= 0 ? WEEKDAY_SHORT_NAMES[idx] : raw.trim().slice(0, 3);
}

function intervalsOverlapPeriodic(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  const aShifts = [
    [aStart, aEnd],
    [aStart + 1440, aEnd + 1440],
  ];
  const bShifts = [
    [bStart, bEnd],
    [bStart + 1440, bEnd + 1440],
  ];
  for (const [as, ae] of aShifts) {
    for (const [bs, be] of bShifts) {
      if (Math.max(as, bs) < Math.min(ae, be)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves whether `workDate` (Asia/Manila) is a scheduled Working Day or Rest Day,
 * enforces Regular OT vs RDOT rules, and blocks working-day OT overlapping regular shift hours.
 */
export function validateAndClassifyOvertimeRequest(
  input: ValidateOvertimeInput
): ValidateOvertimeResult {
  const cleanDate = String(input.workDate ?? "").trim();
  const parsedDate = new Date(`${cleanDate}T00:00:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || Number.isNaN(parsedDate.getTime())) {
    return {
      valid: false,
      isRestDay: false,
      resolvedType: input.requestedType === "rdot" ? "rdot" : "regular_ot",
      dayShort: "",
      crossesMidnight: false,
      durationMinutes: 0,
      durationHours: 0,
      error: "Please select a valid work date.",
    };
  }

  // Convert +08:00 midnight to PHT weekday index safely
  const phtDate = new Date(parsedDate.getTime() + PHT_OFFSET_MS);
  const weekdayIdx = phtDate.getUTCDay();
  const dayShort = WEEKDAY_SHORT_NAMES[weekdayIdx];
  const dayFull = WEEKDAY_FULL_NAMES[weekdayIdx];

  let isRestDay = false;
  const dwm = input.dailyWorkModes;
  if (dwm && typeof dwm === "object") {
    const rawDayMode =
      dwm[dayShort] ??
      dwm[dayShort.toLowerCase()] ??
      dwm[dayFull] ??
      dwm[dayFull.toLowerCase()];
    if (rawDayMode != null && String(rawDayMode).trim() !== "") {
      const norm = String(rawDayMode).trim().toLowerCase();
      isRestDay = norm === "rest" || norm === "off";
    } else if (Array.isArray(input.workDays) && input.workDays.length > 0) {
      const normalizedWorkDays = input.workDays.map(normalizeShortWeekdayToken);
      isRestDay = !normalizedWorkDays.includes(dayShort);
    }
  } else if (Array.isArray(input.workDays) && input.workDays.length > 0) {
    const normalizedWorkDays = input.workDays.map(normalizeShortWeekdayToken);
    isRestDay = !normalizedWorkDays.includes(dayShort);
  } else {
    // Default Mon–Fri work week when no explicit work_days configured
    isRestDay = dayShort === "Sat" || dayShort === "Sun";
  }

  const expectedType: OvertimeType = isRestDay ? "rdot" : "regular_ot";
  const requestedType: OvertimeType = input.requestedType ?? expectedType;

  const windowCheck = computeOvertimeWindowMinutes(input.startTime, input.endTime);
  if (!windowCheck.valid) {
    return {
      valid: false,
      isRestDay,
      resolvedType: expectedType,
      dayShort,
      crossesMidnight: windowCheck.crossesMidnight,
      durationMinutes: windowCheck.durationMinutes,
      durationHours: windowCheck.durationHours,
      error: windowCheck.error,
    };
  }

  if (!isRestDay && requestedType === "rdot") {
    return {
      valid: false,
      isRestDay,
      resolvedType: "regular_ot",
      dayShort,
      crossesMidnight: windowCheck.crossesMidnight,
      durationMinutes: windowCheck.durationMinutes,
      durationHours: windowCheck.durationHours,
      error:
        "Cannot file Rest Day Overtime (RDOT) on a scheduled working day. Use Regular Overtime (After Shift) instead.",
    };
  }

  if (isRestDay && requestedType === "regular_ot") {
    return {
      valid: false,
      isRestDay,
      resolvedType: "rdot",
      dayShort,
      crossesMidnight: windowCheck.crossesMidnight,
      durationMinutes: windowCheck.durationMinutes,
      durationHours: windowCheck.durationHours,
      error:
        "This date is a scheduled Rest Day. Overtime on a rest day must be filed as Rest Day Overtime (RDOT).",
    };
  }

  // Working day: ensure OT window does not overlap regular shift hours
  if (!isRestDay && input.shiftStart && input.shiftEnd) {
    const [sH, sM] = parseTimeHm(input.shiftStart, -1, -1);
    const [eH, eM] = parseTimeHm(input.shiftEnd, -1, -1);
    const [otSH, otSM] = parseTimeHm(input.startTime, -1, -1);
    const [otEH, otEM] = parseTimeHm(input.endTime, -1, -1);

    if (sH >= 0 && sM >= 0 && eH >= 0 && eM >= 0 && otSH >= 0 && otEH >= 0) {
      const shiftStartMin = sH * 60 + sM;
      let shiftEndMin = eH * 60 + eM;
      if (shiftEndMin <= shiftStartMin) {
        shiftEndMin += 1440;
      }

      const otStartMin = otSH * 60 + otSM;
      let otEndMin = otEH * 60 + otEM;
      if (otEndMin <= otStartMin) {
        otEndMin += 1440;
      }

      if (intervalsOverlapPeriodic(otStartMin, otEndMin, shiftStartMin, shiftEndMin)) {
        return {
          valid: false,
          isRestDay,
          resolvedType: "regular_ot",
          dayShort,
          crossesMidnight: windowCheck.crossesMidnight,
          durationMinutes: windowCheck.durationMinutes,
          durationHours: windowCheck.durationHours,
          error:
            "Overtime on a working day must be outside regular shift hours (after shift or pre-shift).",
        };
      }
    }
  }

  return {
    valid: true,
    isRestDay,
    resolvedType: expectedType,
    dayShort,
    crossesMidnight: windowCheck.crossesMidnight,
    durationMinutes: windowCheck.durationMinutes,
    durationHours: windowCheck.durationHours,
  };
}

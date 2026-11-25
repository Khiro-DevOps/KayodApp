export interface AttendanceLogLike {
  date?: string | null;
  clock_in?: string | null;
}

export interface ApprovedLeaveLike {
  start_date: string;
  end_date: string;
  status?: string | null;
  leave_type?: string | null;
}

export interface ApprovedUndertimeLike {
  work_date: string;
  undertime_type?: string | null;
  requested_in?: string | null;
  requested_out?: string | null;
  undertime_minutes?: number | null;
  deduction_mode?: string | null;
  status?: string | null;
}

export interface ComputeUnexcusedAbsencesInput {
  periodStart: string;
  periodEnd: string;
  effectiveStartDate?: string | null;
  workDays?: string[] | null;
  shiftEnd?: string | null;
  attendanceLogs: AttendanceLogLike[];
  approvedLeaves: ApprovedLeaveLike[];
  approvedUndertimes?: ApprovedUndertimeLike[];
  now?: Date;
}

function addMinutesToHm(hm: string, deltaMinutes: number): string {
  const [hStr, mStr] = hm.split(":");
  const h = Number.parseInt(hStr ?? "8", 10);
  const m = Number.parseInt(mStr ?? "0", 10);
  const base = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
  const wrapped = ((base + deltaMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(
    wrapped % 60
  ).padStart(2, "0")}`;
}

export function resolveEffectiveShiftWindow(
  shift: {
    workDate: string;
    scheduledIn?: string | null;
    scheduledOut?: string | null;
  },
  approvedUndertime?: ApprovedUndertimeLike | ApprovedUndertimeLike[] | null
): { effectiveIn: string; effectiveOut: string } {
  const baseIn = (shift.scheduledIn ?? "08:00").trim() || "08:00";
  const baseOut = (shift.scheduledOut ?? "17:00").trim() || "17:00";

  if (!approvedUndertime) {
    return { effectiveIn: baseIn, effectiveOut: baseOut };
  }

  const list = Array.isArray(approvedUndertime) ? approvedUndertime : [approvedUndertime];
  const targetDate = shift.workDate.slice(0, 10);
  const match = list.find(
    (ut) =>
      ut.work_date?.slice(0, 10) === targetDate &&
      (!ut.status || ut.status.toLowerCase() === "approved")
  );

  if (!match) {
    return { effectiveIn: baseIn, effectiveOut: baseOut };
  }

  const utType = String(match.undertime_type ?? "early_out").toLowerCase();
  if (utType === "late_in") {
    return {
      effectiveIn: match.requested_in ? match.requested_in : baseIn,
      effectiveOut: baseOut,
    };
  }
  if (utType === "half_day_first") {
    return {
      effectiveIn: match.requested_in ? match.requested_in : addMinutesToHm(baseIn, 300),
      effectiveOut: baseOut,
    };
  }
  if (utType === "half_day_second") {
    return {
      effectiveIn: baseIn,
      effectiveOut: match.requested_out ? match.requested_out : addMinutesToHm(baseIn, 240),
    };
  }

  return {
    effectiveIn: baseIn,
    effectiveOut: match.requested_out ? match.requested_out : baseOut,
  };
}

export function resolveEffectiveShiftEnd(
  workDate: string,
  scheduledOut: string | null | undefined,
  approvedUndertimes?: ApprovedUndertimeLike[] | null
): string {
  return resolveEffectiveShiftWindow(
    { workDate, scheduledOut },
    approvedUndertimes
  ).effectiveOut;
}

export interface ComputeUnexcusedAbsencesResult {
  absentDays: number;
  absentDates: string[];
}

const DEFAULT_WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_INDEX_TO_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function normalizeDayToken(day: string): string {
  return day.trim().slice(0, 3).toLowerCase();
}

export function getTodayPhtIso(now: Date = new Date()): string {
  return getPhtDateAndMinutes(now).dateStr;
}

function getPhtDateAndMinutes(now: Date): { dateStr: string; minutes: number } {
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const pht = new Date(phtMs);
  const y = pht.getUTCFullYear();
  const m = String(pht.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pht.getUTCDate()).padStart(2, "0");
  const minutes = pht.getUTCHours() * 60 + pht.getUTCMinutes();
  return { dateStr: `${y}-${m}-${d}`, minutes };
}

function toPhtDateStr(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    return isoOrDate;
  }
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoOrDate.slice(0, 10);
  }
  const pht = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  const y = pht.getUTCFullYear();
  const m = String(pht.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pht.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseShiftMinutes(shiftEnd: string | null | undefined): number {
  const raw = (shiftEnd ?? "17:00").trim();
  const [hStr, mStr] = raw.split(":");
  const h = Number.parseInt(hStr ?? "17", 10);
  const m = Number.parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 17 * 60;
  return h * 60 + m;
}

export function computeUnexcusedAbsences(
  input: ComputeUnexcusedAbsencesInput
): ComputeUnexcusedAbsencesResult {
  const now = input.now ?? new Date();
  const { dateStr: todayPht, minutes: nowPhtMinutes } = getPhtDateAndMinutes(now);
  const shiftEndMinutes = parseShiftMinutes(input.shiftEnd);

  const startIso = input.periodStart.slice(0, 10);
  const effectiveStartIso = input.effectiveStartDate
    ? input.effectiveStartDate.slice(0, 10)
    : null;
  const rawEndIso = input.periodEnd.slice(0, 10);
  const endIso = rawEndIso < todayPht ? rawEndIso : todayPht;

  if (endIso < startIso || (effectiveStartIso && endIso < effectiveStartIso)) {
    return { absentDays: 0, absentDates: [] };
  }

  const normalizedWorkDays = new Set(
    (input.workDays && input.workDays.length > 0 ? input.workDays : DEFAULT_WORK_DAYS).map(
      normalizeDayToken
    )
  );

  const clockedInDates = new Set<string>();
  for (const log of input.attendanceLogs) {
    if (!log.clock_in) continue;
    clockedInDates.add(toPhtDateStr(log.clock_in));
    if (log.date) {
      clockedInDates.add(log.date.slice(0, 10));
    }
  }

  const activeLeaves = input.approvedLeaves.filter(
    (lr) =>
      (!lr.status || lr.status.toLowerCase() === "approved") &&
      String(lr.leave_type ?? "").trim().toLowerCase() !== "unpaid"
  );

  const absentDates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const endDate = new Date(`${endIso}T00:00:00Z`);

  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    const dayIso = `${y}-${m}-${d}`;
    if (effectiveStartIso && dayIso < effectiveStartIso) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }
    const dayToken = DAY_INDEX_TO_SHORT[cursor.getUTCDay()];

    const effectiveShiftEnd = resolveEffectiveShiftEnd(
      dayIso,
      input.shiftEnd,
      input.approvedUndertimes
    );
    const effectiveShiftEndMinutes =
      effectiveShiftEnd === (input.shiftEnd ?? "17:00")
        ? shiftEndMinutes
        : parseShiftMinutes(effectiveShiftEnd);

    const isTodayBeforeShiftEnd =
      dayIso === todayPht && nowPhtMinutes < effectiveShiftEndMinutes;

    if (!isTodayBeforeShiftEnd && normalizedWorkDays.has(dayToken)) {
      const hasClockIn = clockedInDates.has(dayIso);
      const hasApprovedLeave = activeLeaves.some(
        (lr) => lr.start_date.slice(0, 10) <= dayIso && lr.end_date.slice(0, 10) >= dayIso
      );

      if (!hasClockIn && !hasApprovedLeave) {
        absentDates.push(dayIso);
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    absentDays: absentDates.length,
    absentDates,
  };
}

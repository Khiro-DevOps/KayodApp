export interface AttendanceLogLike {
  date?: string | null;
  clock_in?: string | null;
}

export interface ApprovedLeaveLike {
  start_date: string;
  end_date: string;
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
  now?: Date;
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
    (lr) => !lr.status || lr.status.toLowerCase() === "approved"
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

    const isTodayBeforeShiftEnd =
      dayIso === todayPht && nowPhtMinutes < shiftEndMinutes;

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

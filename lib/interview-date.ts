import { TIMEZONE } from "@/lib/interview-schedule-config";

const TIME_ZONE = TIMEZONE;

function dateKey(dateValue: string | Date | null | undefined) {
  if (!dateValue) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateValue));
}

export function getPhtDateGroup(dateValue: string | Date | null | undefined, now = new Date()) {
  const key = dateKey(dateValue);
  if (!key) return "Unscheduled";
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: "long", month: "short", day: "numeric" }).format(new Date(String(dateValue)));
}

export function formatPhtDateTime(dateValue: string | Date | null | undefined) {
  return dateValue
    ? new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(dateValue))
    : "Time to be confirmed";
}

export function formatPhtDate(dateValue: string | Date | null | undefined) {
  if (!dateValue) return "Unscheduled";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(dateValue));
}

export function formatPhtTime(dateValue: string | Date | null | undefined) {
  if (!dateValue) return "";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(dateValue));
}

/**
 * Converts a datetime-local input string ("YYYY-MM-DDTHH:mm") into a UTC ISO string,
 * treating the input value as Philippine Standard Time (UTC+08:00).
 */
export function phtInputToUtcIso(dateTimeLocalValue: string): string {
  if (!dateTimeLocalValue) return "";
  const trimmed = dateTimeLocalValue.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  return new Date(`${withSeconds}+08:00`).toISOString();
}

/**
 * Formats a Date or UTC ISO string into "YYYY-MM-DDTHH:mm" for datetime-local inputs,
 * showing the wall-clock time in Philippine Standard Time regardless of client timezone.
 */
export function utcToPhtInputString(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  const phtDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return phtDate.toISOString().slice(0, 16);
}

/**
 * Returns date parts evaluated in Asia/Manila (UTC+08:00).
 */
export function getPhtDateParts(dateValue: string | Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const d = new Date(dateValue);
  const phtDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: phtDate.getUTCFullYear(),
    month: phtDate.getUTCMonth() + 1,
    day: phtDate.getUTCDate(),
    hour: phtDate.getUTCHours(),
    minute: phtDate.getUTCMinutes(),
    dayOfWeek: phtDate.getUTCDay(),
  };
}

/**
 * Creates a Date instance representing the given year/month/day/hour/minute in PHT (UTC+08:00).
 */
export function createPhtDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
  return new Date(isoStr);
}

/**
 * Formats conflict time in HH:mm 24-hour PHT.
 */
export function formatPhtConflictTime(dateValue: number | Date | string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateValue));
}

/**
 * Formats conflict date in YYYY-MM-DD PHT.
 */
export function formatPhtConflictDate(dateValue: number | Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateValue));
}

/**
 * Checks if a given datetime (or datetime-local PHT string) falls outside
 * standard working hours (10:00 - 17:00 PHT) or falls on a weekend (Sat/Sun).
 * Returns non-blocking warning string or null.
 */
export function checkPhtWorkHoursWarning(
  dateValue: string | Date | null | undefined,
  durationMinutes = 60
): string | null {
  if (!dateValue) return null;
  const iso = typeof dateValue === "string" && !dateValue.includes("Z") && !dateValue.includes("+")
    ? phtInputToUtcIso(dateValue)
    : String(dateValue);
  const startParts = getPhtDateParts(iso);
  const endDate = new Date(new Date(iso).getTime() + durationMinutes * 60_000);
  const endParts = getPhtDateParts(endDate);

  const isWeekend = startParts.dayOfWeek === 0 || startParts.dayOfWeek === 6;
  const startMinute = startParts.hour * 60 + startParts.minute;
  const endMinute = endParts.hour * 60 + endParts.minute;

  const isOutsideHours = startMinute < 10 * 60 || endMinute > 17 * 60;

  if (isWeekend && isOutsideHours) {
    return "Note: Selected time is on a weekend and outside standard working hours (10:00 AM - 5:00 PM PHT).";
  }
  if (isWeekend) {
    return "Note: Selected time is on a weekend (Saturday/Sunday).";
  }
  if (isOutsideHours) {
    return "Note: Selected time is outside standard working hours (10:00 AM - 5:00 PM PHT).";
  }
  return null;
}

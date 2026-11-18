export const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_INDEX_BY_TOKEN: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

const HYBRID_TAG_REGEX = /\[HYBRID:ONSITE=([^|\]]*)\|WFH=([^\]]*)\]/i;

export function toFullDayName(day: string): string | null {
  const idx = DAY_INDEX_BY_TOKEN[day.trim().toLowerCase()];
  return idx !== undefined ? DAYS_FULL[idx] : null;
}

export function toShortDayName(day: string): string | null {
  const idx = DAY_INDEX_BY_TOKEN[day.trim().toLowerCase()];
  return idx !== undefined ? DAYS_SHORT[idx] : null;
}

export function normalizeDaysToFull(days: string[] | null | undefined): string[] {
  if (!Array.isArray(days)) return [];
  const seen = new Set<number>();
  for (const d of days) {
    const idx = DAY_INDEX_BY_TOKEN[String(d).trim().toLowerCase()];
    if (idx !== undefined) seen.add(idx);
  }
  return Array.from(seen)
    .sort((a, b) => a - b)
    .map((idx) => DAYS_FULL[idx]);
}

export function parseHybridScheduleNotes(notes: string | null | undefined): {
  onsiteDays: string[];
  wfhDays: string[];
  cleanNotes: string;
} | null {
  if (!notes) return null;
  const match = notes.match(HYBRID_TAG_REGEX);
  if (!match) return null;

  const onsiteRaw = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const wfhRaw = match[2]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const onsiteDays = normalizeDaysToFull(onsiteRaw);
  const wfhDays = normalizeDaysToFull(wfhRaw);
  const cleanNotes = notes.replace(HYBRID_TAG_REGEX, "").trim();

  return { onsiteDays, wfhDays, cleanNotes };
}

export function stripHybridScheduleTag(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const cleaned = notes.replace(HYBRID_TAG_REGEX, "").trim();
  return cleaned || null;
}

export function buildHybridScheduleNotes(
  notes: string | null | undefined,
  onsiteDays: string[],
  wfhDays: string[]
): string {
  const onsiteShort = normalizeDaysToFull(onsiteDays)
    .map((d) => toShortDayName(d))
    .filter((d): d is string => Boolean(d));
  const wfhShort = normalizeDaysToFull(wfhDays)
    .map((d) => toShortDayName(d))
    .filter((d): d is string => Boolean(d));

  const tag = `[HYBRID:ONSITE=${onsiteShort.join(",")}|WFH=${wfhShort.join(",")}]`;
  const cleaned = stripHybridScheduleTag(notes);
  return cleaned ? `${cleaned}\n${tag}` : tag;
}

export function getPhtDayInfo(now: Date = new Date()): {
  full: string;
  short: string;
  mondayIso: string;
} {
  const full = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  }).format(now);
  const short = toShortDayName(full) ?? "Mon";

  // Compute current Monday in Asia/Manila (YYYY-MM-DD)
  const phtDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = phtDateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = utcDate.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  const mondayIso = utcDate.toISOString().slice(0, 10);

  return { full, short, mondayIso };
}

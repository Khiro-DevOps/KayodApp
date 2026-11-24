export type ScheduleType = "fixed" | "rotating";

export type RestDaysPolicy =
  | "rotating_rest_days"
  | "flexible_split_rest_days"
  | "fixed_weekends";

export type ShiftRotationPattern =
  | "fixed_shift_hours"
  | "weekly_rotation"
  | "biweekly_custom_rotation";

export const ALL_WEEK_DAYS_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

const SHORT_DAY_LOOKUP: Record<string, (typeof ALL_WEEK_DAYS_SHORT)[number]> = {
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
  sat: "Sat",
  saturday: "Sat",
  sun: "Sun",
  sunday: "Sun",
};

export const REST_DAYS_POLICY_OPTIONS: Array<{
  value: RestDaysPolicy;
  label: string;
}> = [
  { value: "rotating_rest_days", label: "Rotating Rest Days" },
  { value: "flexible_split_rest_days", label: "Flexible / Split Rest Days" },
  { value: "fixed_weekends", label: "Fixed Weekends" },
];

export const SHIFT_ROTATION_PATTERN_OPTIONS: Array<{
  value: ShiftRotationPattern;
  label: string;
}> = [
  { value: "fixed_shift_hours", label: "Fixed Shift Hours" },
  {
    value: "weekly_rotation",
    label: "Weekly Rotation (Morning / Mid / Graveyard)",
  },
  {
    value: "biweekly_custom_rotation",
    label: "Bi-Weekly / Custom Rotation",
  },
];

export function normalizeScheduleType(value: unknown): ScheduleType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "rotating" || raw === "flexible" || raw === "shifting") {
    return "rotating";
  }
  return "fixed";
}

export function normalizeRestDaysPolicy(
  value: unknown,
  scheduleType?: ScheduleType,
): RestDaysPolicy {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "rotating_rest_days" || raw === "rotating") {
    return "rotating_rest_days";
  }
  if (
    raw === "flexible_split_rest_days" ||
    raw === "flexible" ||
    raw === "manager_assigned"
  ) {
    return "flexible_split_rest_days";
  }
  if (raw === "fixed_weekends" || raw === "fixed") {
    return "fixed_weekends";
  }
  return scheduleType === "rotating" ? "rotating_rest_days" : "fixed_weekends";
}

export function mapRestDaysPolicyToLegacyType(
  policy: RestDaysPolicy,
): "fixed" | "rotating" | "flexible" {
  if (policy === "rotating_rest_days") return "rotating";
  if (policy === "flexible_split_rest_days") return "flexible";
  return "fixed";
}

export function normalizeShiftRotationPattern(
  value: unknown,
  scheduleType?: ScheduleType,
): ShiftRotationPattern {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "weekly_rotation" || raw === "weekly") {
    return "weekly_rotation";
  }
  if (
    raw === "biweekly_custom_rotation" ||
    raw === "biweekly" ||
    raw === "custom"
  ) {
    return "biweekly_custom_rotation";
  }
  if (raw === "fixed_shift_hours" || raw === "fixed") {
    return "fixed_shift_hours";
  }
  return scheduleType === "rotating" ? "weekly_rotation" : "fixed_shift_hours";
}

export function clampWorkDaysPerWeek(value: unknown, fallback = 5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(7, Math.max(1, Math.round(parsed)));
}

export function normalizeShortWorkDays(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const d of days) {
    const mapped = SHORT_DAY_LOOKUP[String(d ?? "").trim().toLowerCase()];
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
    }
  }
  for (const day of ALL_WEEK_DAYS_SHORT) {
    if (seen.has(day)) ordered.push(day);
  }
  return ordered;
}

export function resolveDefaultWorkDaysForCount(count: number): string[] {
  const clamped = Math.min(6, Math.max(1, Math.round(count)));
  return ALL_WEEK_DAYS_SHORT.slice(0, clamped);
}

export function formatScheduleTime12h(timeStr?: string | null): string {
  if (!timeStr) return "08:00 AM";
  const parts = String(timeStr).trim().split(":");
  const hRaw = Number.parseInt(parts[0] ?? "", 10);
  if (Number.isNaN(hRaw)) return String(timeStr);
  const mStr = (parts[1] ?? "00").slice(0, 2).padStart(2, "0");
  const ampm = hRaw >= 12 ? "PM" : "AM";
  const h = hRaw % 12 || 12;
  return `${h < 10 ? `0${h}` : h}:${mStr} ${ampm}`;
}

export function formatScheduleTypeLabel(type: ScheduleType): string {
  return type === "rotating" ? "Rotating / Shifting Schedule" : "Fixed Schedule";
}

export function formatRestDaysPolicyLabel(policy: RestDaysPolicy): string {
  return (
    REST_DAYS_POLICY_OPTIONS.find((o) => o.value === policy)?.label ??
    "Fixed Weekends"
  );
}

export function formatShiftRotationPatternLabel(
  pattern: ShiftRotationPattern,
): string {
  return (
    SHIFT_ROTATION_PATTERN_OPTIONS.find((o) => o.value === pattern)?.label ??
    "Fixed Shift Hours"
  );
}

export function buildWorkScheduleSummary(input: {
  scheduleType?: unknown;
  workDaysPerWeek?: unknown;
  restDaysPolicy?: unknown;
  shiftRotationPattern?: unknown;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: unknown;
}): string {
  const scheduleType = normalizeScheduleType(input.scheduleType);
  const shiftStart = formatScheduleTime12h(input.shiftStart ?? "08:00");
  const shiftEnd = formatScheduleTime12h(input.shiftEnd ?? "17:00");
  const shortDays = normalizeShortWorkDays(input.workDays);
  const workDaysPerWeek = clampWorkDaysPerWeek(
    input.workDaysPerWeek,
    shortDays.length > 0 ? shortDays.length : 5,
  );
  const restDaysPolicy = normalizeRestDaysPolicy(
    input.restDaysPolicy,
    scheduleType,
  );
  const rotationPattern = normalizeShiftRotationPattern(
    input.shiftRotationPattern,
    scheduleType,
  );

  if (scheduleType === "rotating") {
    return [
      "Rotating / Shifting Schedule",
      formatShiftRotationPatternLabel(rotationPattern),
      `${workDaysPerWeek} Work Days/Week (${formatRestDaysPolicyLabel(restDaysPolicy)})`,
      `Initial Shift: ${shiftStart} – ${shiftEnd}`,
    ].join(" • ");
  }

  const daysText =
    shortDays.length > 0
      ? shortDays.join(", ")
      : resolveDefaultWorkDaysForCount(workDaysPerWeek).join(", ");
  return `Fixed Schedule • ${daysText} (${workDaysPerWeek} Work Days/Week) • ${shiftStart} – ${shiftEnd}`;
}

export function getCurrentManilaWeekStart(now = new Date()): string {
  const todayStr = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const [y, m, d] = todayStr.split("-").map((n) => Number.parseInt(n, 10));
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const day = utcDate.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMon = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMon);
  return utcDate.toISOString().slice(0, 10);
}

export function resolveInitialHireSchedule(input: {
  offer?: {
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    logistics?: Record<string, unknown> | null;
    job_metadata?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  jobPosting?: {
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    schedule_type?: string | null;
    rest_days_type?: string | null;
    offer_letter_settings?: Record<string, unknown> | null;
  } | null;
}) {
  const offerMeta = (input.offer?.job_metadata ?? input.offer?.metadata ?? {}) as Record<string, unknown>;
  const logistics = (input.offer?.logistics ?? {}) as Record<string, unknown>;
  const jobSettings = (input.jobPosting?.offer_letter_settings ?? {}) as Record<string, unknown>;

  const scheduleType = normalizeScheduleType(
    offerMeta.schedule_type ?? jobSettings.schedule_type ?? input.jobPosting?.schedule_type
  );
  const shiftStart = String(
    input.offer?.shift_start ??
      (typeof logistics.shift_start === "string" ? logistics.shift_start : null) ??
      (typeof offerMeta.shift_start === "string" ? offerMeta.shift_start : null) ??
      input.jobPosting?.shift_start ??
      (typeof jobSettings.shift_start === "string" ? jobSettings.shift_start : null) ??
      "08:00"
  ).slice(0, 5);
  const shiftEnd = String(
    input.offer?.shift_end ??
      (typeof logistics.shift_end === "string" ? logistics.shift_end : null) ??
      (typeof offerMeta.shift_end === "string" ? offerMeta.shift_end : null) ??
      input.jobPosting?.shift_end ??
      (typeof jobSettings.shift_end === "string" ? jobSettings.shift_end : null) ??
      "17:00"
  ).slice(0, 5);

  const rawWorkDays = normalizeShortWorkDays(
    Array.isArray(input.offer?.work_days) && input.offer.work_days.length > 0
      ? input.offer.work_days
      : Array.isArray(logistics.work_days) && logistics.work_days.length > 0
        ? logistics.work_days
        : Array.isArray(offerMeta.work_days) && offerMeta.work_days.length > 0
          ? offerMeta.work_days
          : Array.isArray(input.jobPosting?.work_days) && input.jobPosting.work_days.length > 0
            ? input.jobPosting.work_days
            : jobSettings.work_days
  );

  const workDaysPerWeek = clampWorkDaysPerWeek(
    offerMeta.work_days_per_week ?? jobSettings.work_days_per_week,
    rawWorkDays.length > 0 ? rawWorkDays.length : 5
  );
  const restDaysPolicy = normalizeRestDaysPolicy(
    offerMeta.rest_days_policy ??
      jobSettings.rest_days_policy ??
      input.jobPosting?.rest_days_type,
    scheduleType
  );
  const shiftRotationPattern = normalizeShiftRotationPattern(
    offerMeta.shift_rotation_pattern ?? jobSettings.shift_rotation_pattern,
    scheduleType
  );
  const workDays =
    rawWorkDays.length > 0
      ? rawWorkDays
      : scheduleType === "rotating"
        ? resolveDefaultWorkDaysForCount(workDaysPerWeek)
        : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const workScheduleSummary =
    (typeof offerMeta.work_schedule_summary === "string" && offerMeta.work_schedule_summary.trim()) ||
    buildWorkScheduleSummary({
      scheduleType,
      workDaysPerWeek,
      restDaysPolicy,
      shiftRotationPattern,
      shiftStart,
      shiftEnd,
      workDays,
    });

  return {
    scheduleType,
    workDaysPerWeek,
    restDaysPolicy,
    shiftRotationPattern,
    shiftStart,
    shiftEnd,
    workDays,
    workScheduleSummary,
  };
}

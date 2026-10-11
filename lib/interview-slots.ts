import {
  DEFAULT_DAYS_AHEAD,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_START_HOUR,
  SKIP_WEEKENDS,
  SLOT_STEP_MINUTES,
  WORK_END_HOUR,
} from "./interview-schedule-config";
import {
  createPhtDate,
  formatPhtDate,
  formatPhtTime,
  getPhtDateParts,
} from "./interview-date";

export interface ScheduleRow {
  id?: string;
  interviewer_id?: string | null;
  applicant_id?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  proposed_slots?: any;
  selected_slot?: any;
  job?: { title?: string | null } | null;
  job_postings?: { title?: string | null } | null;
}

/**
 * Extracts busy intervals [start, end] in epoch milliseconds from interview schedule rows.
 * Handles selected_slot, scheduled_at, and proposed_slots identically.
 */
export function extractBusyIntervalsFromRows(
  rows: ScheduleRow[]
): Array<{ start: number; end: number; row: ScheduleRow }> {
  const busyIntervals: Array<{ start: number; end: number; row: ScheduleRow }> = [];

  for (const row of rows) {
    if (row.selected_slot?.start_time) {
      const start = new Date(row.selected_slot.start_time).getTime();
      const dur =
        typeof row.duration_minutes === "number" && row.duration_minutes > 0
          ? row.duration_minutes
          : row.selected_slot.end_time
          ? Math.round((new Date(row.selected_slot.end_time).getTime() - start) / 60_000)
          : DEFAULT_DURATION_MINUTES;
      const end = row.selected_slot.end_time
        ? new Date(row.selected_slot.end_time).getTime()
        : start + dur * 60_000;
      busyIntervals.push({ start, end, row });
    } else if (row.scheduled_at) {
      const start = new Date(row.scheduled_at).getTime();
      const dur =
        typeof row.duration_minutes === "number" && row.duration_minutes > 0
          ? row.duration_minutes
          : DEFAULT_DURATION_MINUTES;
      busyIntervals.push({ start, end: start + dur * 60_000, row });
    } else if (Array.isArray(row.proposed_slots)) {
      for (const ps of row.proposed_slots) {
        if (ps && ps.start_time) {
          const start = new Date(ps.start_time).getTime();
          const dur =
            typeof row.duration_minutes === "number" && row.duration_minutes > 0
              ? row.duration_minutes
              : ps.end_time
              ? Math.round((new Date(ps.end_time).getTime() - start) / 60_000)
              : DEFAULT_DURATION_MINUTES;
          const end = ps.end_time
            ? new Date(ps.end_time).getTime()
            : start + dur * 60_000;
          busyIntervals.push({ start, end, row });
        }
      }
    }
  }

  return busyIntervals;
}

/**
 * Overlap check: start < otherEnd && end > otherStart (touching ends do not overlap).
 */
export function checkIntervalOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

export interface ExistingScheduleSlot {
  start_time: string;
  end_time?: string | null;
  duration_minutes?: number | null;
}

export interface GetNextAvailableSlotOptions {
  interviewerId?: string | null;
  applicantId?: string | null;
  durationMinutes?: number | null;
  fromDate?: Date | string | null;
  daysAhead?: number;
  skipWeekends?: boolean;
  excludeInterviewId?: string | null;
  existingSchedules?: ExistingScheduleSlot[];
  supabaseClient?: any;
}

export interface NextAvailableSlotResult {
  start_time: string;
  end_time: string;
  movedReason?: string | null;
  conflictType?: "interviewer" | "applicant" | "both" | "weekend" | null;
}

/**
 * Calculates the next available interview slot adhering to PHT work hours (10:00 - 17:00 PHT),
 * skipping weekends, and avoiding overlaps with existing interview schedules.
 */
export async function getNextAvailableSlot(
  options: GetNextAvailableSlotOptions = {}
): Promise<NextAvailableSlotResult> {
  const duration =
    typeof options.durationMinutes === "number" && options.durationMinutes > 0
      ? options.durationMinutes
      : DEFAULT_DURATION_MINUTES;

  const daysAhead =
    typeof options.daysAhead === "number"
      ? options.daysAhead
      : DEFAULT_DAYS_AHEAD;

  const shouldSkipWeekends = options.skipWeekends ?? SKIP_WEEKENDS;

  const baseReferenceDate = options.fromDate
    ? new Date(options.fromDate)
    : new Date();

  const refParts = getPhtDateParts(baseReferenceDate);

  // Target calendar date starts at refDate + daysAhead
  let targetDateUtc = new Date(
    Date.UTC(refParts.year, refParts.month - 1, refParts.day + daysAhead, 10, 0, 0)
  );

  let weekendReason: string | null = null;
  if (shouldSkipWeekends) {
    const dow = targetDateUtc.getUTCDay();
    if (dow === 6) {
      // Saturday -> move to Monday (+2 days)
      targetDateUtc = new Date(
        Date.UTC(targetDateUtc.getUTCFullYear(), targetDateUtc.getUTCMonth(), targetDateUtc.getUTCDate() + 2, 10, 0, 0)
      );
      weekendReason = "Scheduled for Monday because Saturday is outside working days";
    } else if (dow === 0) {
      // Sunday -> move to Monday (+1 day)
      targetDateUtc = new Date(
        Date.UTC(targetDateUtc.getUTCFullYear(), targetDateUtc.getUTCMonth(), targetDateUtc.getUTCDate() + 1, 10, 0, 0)
      );
      weekendReason = "Scheduled for Monday because Sunday is outside working days";
    }
  }

  const baseTargetYear = targetDateUtc.getUTCFullYear();
  const baseTargetMonth = targetDateUtc.getUTCMonth() + 1;
  const baseTargetDay = targetDateUtc.getUTCDate();

  const baseStart = createPhtDate(
    baseTargetYear,
    baseTargetMonth,
    baseTargetDay,
    DEFAULT_START_HOUR,
    0
  ).getTime();
  const baseEnd = baseStart + duration * 60_000;

  // Retrieve or compile busy intervals
  let busyIntervals: Array<{ start: number; end: number; type?: "interviewer" | "applicant" }> = [];

  if (options.existingSchedules && options.existingSchedules.length > 0) {
    for (const sched of options.existingSchedules) {
      if (sched.start_time) {
        const start = new Date(sched.start_time).getTime();
        const dur =
          typeof sched.duration_minutes === "number" && sched.duration_minutes > 0
            ? sched.duration_minutes
            : sched.end_time
            ? Math.round((new Date(sched.end_time).getTime() - start) / 60_000)
            : DEFAULT_DURATION_MINUTES;
        const end = sched.end_time
          ? new Date(sched.end_time).getTime()
          : start + dur * 60_000;
        busyIntervals.push({ start, end });
      }
    }
  } else if (options.supabaseClient && (options.interviewerId || options.applicantId)) {
    try {
      let query = options.supabaseClient
        .from("interview_schedules")
        .select("id, interviewer_id, applicant_id, status, scheduled_at, duration_minutes, proposed_slots, selected_slot")
        .not("status", "in", '("cancelled","completed")');

      if (options.interviewerId && options.applicantId) {
        query = query.or(`interviewer_id.eq.${options.interviewerId},applicant_id.eq.${options.applicantId}`);
      } else if (options.interviewerId) {
        query = query.eq("interviewer_id", options.interviewerId);
      } else if (options.applicantId) {
        query = query.eq("applicant_id", options.applicantId);
      }

      if (options.excludeInterviewId) {
        query = query.neq("id", options.excludeInterviewId);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        const extracted = extractBusyIntervalsFromRows(data);
        busyIntervals = extracted.map((item) => {
          let type: "interviewer" | "applicant" | undefined;
          if (options.applicantId && item.row.applicant_id === options.applicantId) {
            type = "applicant";
          } else if (options.interviewerId && item.row.interviewer_id === options.interviewerId) {
            type = "interviewer";
          }
          return { start: item.start, end: item.end, type };
        });
      }
    } catch {
      // Fall back to empty intervals if query fails
    }
  }

  // Conflict overlap check: A < otherEnd && B > otherStart
  const getConflictingIntervals = (start: number, end: number) => {
    return busyIntervals.filter((inv) => checkIntervalOverlap(start, end, inv.start, inv.end));
  };
  const hasConflict = (start: number, end: number) => {
    return busyIntervals.some((inv) => checkIntervalOverlap(start, end, inv.start, inv.end));
  };

  // Search forward in 30-min increments within work hours (10:00 - 17:00 PHT)
  // Capped at 60 calendar days
  const maxDays = 60;
  const startMinute = DEFAULT_START_HOUR * 60; // 600 (10:00)
  const maxStartMinute = WORK_END_HOUR * 60 - duration; // e.g. 17:00 - 60 = 16:00 (960)

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const curDate = new Date(
      Date.UTC(baseTargetYear, baseTargetMonth - 1, baseTargetDay + dayOffset, 10, 0, 0)
    );
    const dow = curDate.getUTCDay();

    if (shouldSkipWeekends && (dow === 0 || dow === 6)) {
      continue;
    }

    const y = curDate.getUTCFullYear();
    const m = curDate.getUTCMonth() + 1;
    const d = curDate.getUTCDate();

    for (let minute = startMinute; minute <= maxStartMinute; minute += SLOT_STEP_MINUTES) {
      const h = Math.floor(minute / 60);
      const min = minute % 60;
      const candStart = createPhtDate(y, m, d, h, min).getTime();
      const candEnd = candStart + duration * 60_000;

      if (!hasConflict(candStart, candEnd)) {
        let movedReason: string | null = null;
        let conflictType: "interviewer" | "applicant" | "both" | "weekend" | null = null;

        if (candStart === baseStart) {
          movedReason = weekendReason;
          if (weekendReason) conflictType = "weekend";
        } else {
          const initialConflicts = getConflictingIntervals(baseStart, baseEnd);
          const hasInterviewerConflict = initialConflicts.some((c) => c.type === "interviewer");
          const hasApplicantConflict = initialConflicts.some((c) => c.type === "applicant");

          let conflictSubject = "slot was taken";
          if (hasInterviewerConflict && hasApplicantConflict) {
            conflictSubject = "both interviewer and candidate have conflicts";
            conflictType = "both";
          } else if (hasApplicantConflict) {
            conflictSubject = "candidate has a conflicting interview";
            conflictType = "applicant";
          } else if (hasInterviewerConflict) {
            conflictSubject = "interviewer is busy";
            conflictType = "interviewer";
          }

          const isSameDay =
            curDate.getUTCFullYear() === baseTargetYear &&
            curDate.getUTCMonth() + 1 === baseTargetMonth &&
            curDate.getUTCDate() === baseTargetDay;

          const candTimeStr = formatPhtTime(new Date(candStart));
          const baseTimeStr = formatPhtTime(new Date(baseStart));

          if (isSameDay) {
            movedReason = `Default ${baseTimeStr} slot was taken (${conflictSubject}); moved to ${candTimeStr}`;
            if (weekendReason) {
              movedReason = `${weekendReason} and ${baseTimeStr} slot was taken (${conflictSubject}); moved to ${candTimeStr}`;
            }
          } else {
            const candDateStr = formatPhtDate(new Date(candStart));
            movedReason = `Preferred date was fully booked (${conflictSubject}); moved to ${candDateStr} at ${candTimeStr}`;
            if (weekendReason) {
              movedReason = `${weekendReason} and target day was booked (${conflictSubject}); moved to ${candDateStr} at ${candTimeStr}`;
            }
          }
        }

        return {
          start_time: new Date(candStart).toISOString(),
          end_time: new Date(candEnd).toISOString(),
          movedReason,
          conflictType,
        };
      }
    }
  }

  // If entire 60 days full, fall back to base
  return {
    start_time: new Date(baseStart).toISOString(),
    end_time: new Date(baseEnd).toISOString(),
    movedReason: "No conflict-free slots found in next 60 days",
  };
}

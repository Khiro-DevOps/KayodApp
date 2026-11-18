import { getAdminClient } from "@/lib/supabase/admin";

function parseIsoDateUtc(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
}

function formatIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMondayUtc(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getAffectedWeekStarts(startDate: string, endDate: string): string[] {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const weeks: string[] = [];
  const cursor = getMondayUtc(start);
  const endMonday = getMondayUtc(end);

  while (cursor <= endMonday) {
    weeks.push(formatIsoDateUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
}

export interface SyncApprovedLeaveInput {
  employeeId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  reviewedBy?: string | null;
}

export async function syncApprovedLeaveToSchedules(
  input: SyncApprovedLeaveInput
): Promise<{ success: boolean; weeksUpdated: number; error?: string }> {
  try {
    const weekStarts = getAffectedWeekStarts(input.startDate, input.endDate);
    if (weekStarts.length === 0) {
      return { success: true, weeksUpdated: 0 };
    }

    const admin = getAdminClient();

    const { data: employee } = await admin
      .from("employees")
      .select("shift_start, shift_end, work_mode")
      .eq("id", input.employeeId)
      .maybeSingle();

    const defaultShiftStart = employee?.shift_start || "08:00";
    const defaultShiftEnd = employee?.shift_end || "17:00";
    const defaultLocation =
      employee?.work_mode === "remote" || employee?.work_mode === "wfh"
        ? "remote"
        : employee?.work_mode === "hybrid"
          ? "hybrid"
          : "office";

    const leaveNote = `On Leave: ${input.leaveType} (${input.startDate} to ${input.endDate})`;
    const nowIso = new Date().toISOString();

    const { data: existingSchedules } = await admin
      .from("schedules")
      .select("week_start, shift_start, shift_end, location, notes")
      .eq("employee_id", input.employeeId)
      .in("week_start", weekStarts);

    const existingMap = new Map(
      (existingSchedules ?? []).map((row) => [String(row.week_start), row])
    );

    const rowsToUpsert = weekStarts.map((weekStart) => {
      const existing = existingMap.get(weekStart);
      const existingNotes = existing?.notes?.trim() ?? "";
      const nextNotes = existingNotes
        ? existingNotes.includes(leaveNote)
          ? existingNotes
          : `${existingNotes} | ${leaveNote}`
        : leaveNote;

      return {
        employee_id: input.employeeId,
        week_start: weekStart,
        shift_start: existing?.shift_start || defaultShiftStart,
        shift_end: existing?.shift_end || defaultShiftEnd,
        location: existing?.location || defaultLocation,
        notes: nextNotes,
        is_published: true,
        created_by: input.reviewedBy ?? null,
        updated_at: nowIso,
      };
    });

    const { error: upsertErr } = await admin
      .from("schedules")
      .upsert(rowsToUpsert, { onConflict: "employee_id,week_start" });

    if (upsertErr) {
      console.error("syncApprovedLeaveToSchedules upsert error:", upsertErr);
      return { success: false, weeksUpdated: 0, error: upsertErr.message };
    }

    return { success: true, weeksUpdated: rowsToUpsert.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("syncApprovedLeaveToSchedules error:", err);
    return { success: false, weeksUpdated: 0, error: message };
  }
}

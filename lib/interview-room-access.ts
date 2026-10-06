export const JOIN_EARLY_MINUTES = 10;
export const END_GRACE_MINUTES = 0;

export type InterviewRoomAccessState = "too_early" | "open" | "ended" | "closed";

export type InterviewRoomAccess = {
  state: InterviewRoomAccessState;
  opensAt: Date | null;
  closesAt: Date | null;
};

type InterviewRoomSchedule = {
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  status?: string | null;
  meeting_type?: string | null;
};

export function getRoomAccess(interview: InterviewRoomSchedule, now = new Date()): InterviewRoomAccess {
  const startsAt = interview.scheduled_at ? new Date(interview.scheduled_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { state: "closed", opensAt: null, closesAt: null };
  }

  const opensAt = new Date(startsAt.getTime() - JOIN_EARLY_MINUTES * 60_000);
  const closesAt = new Date(
    startsAt.getTime() + (interview.duration_minutes ?? 45) * 60_000 + END_GRACE_MINUTES * 60_000,
  );

  if (["completed", "cancelled", "no_show"].includes(interview.status ?? "") || interview.meeting_type === "in_person") {
    return { state: "closed", opensAt, closesAt };
  }
  if (now < opensAt) return { state: "too_early", opensAt, closesAt };
  if (now >= closesAt) return { state: "ended", opensAt, closesAt };
  return { state: "open", opensAt, closesAt };
}

export function formatPht(date: Date | null) {
  return date?.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }) ?? "Not scheduled";
}

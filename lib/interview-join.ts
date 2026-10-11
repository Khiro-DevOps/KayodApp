export const JOIN_OPENS_MINUTES_BEFORE = 10;
export const JOIN_GRACE_MINUTES = 15;

export type InterviewJoinState = "not_open" | "open" | "ended";

export function getInterviewJoinState(
  scheduledAt: string | Date | null | undefined,
  durationMinutes: number | null | undefined = 60,
  now: Date = new Date()
): InterviewJoinState {
  if (!scheduledAt) return "not_open";
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return "not_open";

  const opensAt = new Date(start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000);
  const duration = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 60;
  const endsAt = new Date(start.getTime() + (duration + JOIN_GRACE_MINUTES) * 60_000);

  if (now < opensAt) return "not_open";
  if (now >= endsAt) return "ended";
  return "open";
}

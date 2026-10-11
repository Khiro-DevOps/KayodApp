import type { Interview } from "@/lib/types";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";

const DEFAULT_INTERVIEW_DURATION_MINUTES = DEFAULT_DURATION_MINUTES;

export function getInterviewEndTime(
  interview: Pick<Interview, "scheduled_at" | "duration_minutes">,
) {
  const scheduledAt = new Date(interview.scheduled_at).getTime();

  if (!Number.isFinite(scheduledAt)) {
    return null;
  }

  const durationMinutes = interview.duration_minutes ?? DEFAULT_INTERVIEW_DURATION_MINUTES;

  return new Date(scheduledAt + durationMinutes * 60_000);
}

export function isActiveInterview(
  interview: Pick<Interview, "scheduled_at" | "duration_minutes" | "status">,
  now = new Date(),
) {
  if (interview.status === "cancelled" || interview.status === "completed") {
    return false;
  }

  const endTime = getInterviewEndTime(interview);

  return endTime !== null && endTime.getTime() > now.getTime();
}
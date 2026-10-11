"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInterviewJoinState } from "@/lib/interview-join";
import { formatPhtTime } from "@/lib/interview-date";

interface JoinInterviewButtonProps {
  interviewId: string;
  meetingLink?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  status?: string | null;
  meetingType?: string | null;
  selectedSlot?: any;
  className?: string;
}

export default function JoinInterviewButton({
  interviewId,
  meetingLink,
  scheduledAt,
  durationMinutes,
  status,
  meetingType,
  selectedSlot,
  className = "",
}: JoinInterviewButtonProps) {
  const [joinState, setJoinState] = useState(() =>
    getInterviewJoinState(scheduledAt, durationMinutes)
  );

  useEffect(() => {
    const updateState = () => {
      setJoinState(getInterviewJoinState(scheduledAt, durationMinutes));
    };
    updateState();
    const interval = setInterval(updateState, 30_000);
    return () => clearInterval(interval);
  }, [scheduledAt, durationMinutes]);

  // Join buttons appear ONLY when interview status is scheduled / rescheduled / confirmed AND meeting_type is online
  const isScheduled = ["scheduled", "confirmed", "rescheduled"].includes(status ?? "");
  if (!isScheduled) return null;

  if (meetingType !== "online") return null;

  const roomUrl = meetingLink || `/applicant/interviews/${interviewId}/room`;

  if (joinState === "not_open") {
    const timeStr = scheduledAt ? formatPhtTime(scheduledAt) : "";
    return (
      <button
        type="button"
        disabled
        className={`cursor-not-allowed rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-none ${className}`}
      >
        Opens at {timeStr}
      </button>
    );
  }

  if (joinState === "ended") {
    return (
      <button
        type="button"
        disabled
        className={`cursor-not-allowed rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-none ${className}`}
      >
        Interview ended
      </button>
    );
  }

  return (
    <Link
      href={roomUrl}
      target={roomUrl.startsWith("http") ? "_blank" : undefined}
      rel={roomUrl.startsWith("http") ? "noopener noreferrer" : undefined}
      className={`inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 shadow-xs ${className}`}
    >
      Join Interview Call
    </Link>
  );
}

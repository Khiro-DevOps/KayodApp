"use client";

import { Interview } from "@/lib/types";
import { confirmInterviewDone, updateInterviewPreference } from "./actions";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface InterviewCardClientProps {
  interview: Interview;
  isHR: boolean;
  past?: boolean;
  showTypeSelection?: boolean;
}

export function InterviewCardClient({
  interview,
  isHR,
  past = false,
  showTypeSelection = false,
}: InterviewCardClientProps) {
  const router = useRouter();
  const [isSelecting, setIsSelecting] = useState(false);
  const [isCompletedLocally, setIsCompletedLocally] = useState(interview.status === "completed");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(interview.status === "completed");
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    if (past) return;

    const scheduledDate = new Date(interview.scheduled_at);
    const openTime = new Date(scheduledDate.getTime() - 15 * 60 * 1000);
    const msUntilOpen = openTime.getTime() - Date.now();

    if (msUntilOpen > 0 && msUntilOpen < 30 * 60 * 1000) {
      const timer = setTimeout(() => router.refresh(), msUntilOpen);
      return () => clearTimeout(timer);
    }
  }, [past, interview.scheduled_at, router]);

  const app = interview.applications as unknown as {
    id?: string;
    status?: string;
    profiles?: { first_name: string; last_name: string; email: string };
    job_postings?: { title: string };
  };

  const candidateName = app?.profiles
    ? `${app.profiles.first_name} ${app.profiles.last_name}`
    : "Candidate";
  const jobTitle = app?.job_postings?.title ?? "Position";
  const scheduledDate = new Date(interview.scheduled_at);
  const now = new Date();

  // ── Ongoing window logic ─────────────────────────────────────────────────
  const endTime = new Date(
    scheduledDate.getTime() + (interview.duration_minutes ?? 60) * 60000
  );
  const openTime = new Date(scheduledDate.getTime() - 15 * 60000);
  const isOngoing = now >= openTime && now < endTime;
  const isExpired = now >= endTime;

  const canJoinRoom =
    interview.interview_type === "online" &&
    interview.video_room_url &&
    !isExpired &&
    isOngoing &&
    interview.status !== "cancelled" &&
    interview.status !== "completed";

  // HR can complete the interview if:
  // - they are HR
  // - not already completed (locally or from prop)
  // - not cancelled
  // - interview window has started (ongoing or expired — i.e. not future)
  const canCompleteInterview =
    isHR &&
    !past &&
    !isCompletedLocally &&
    interview.status !== "cancelled" &&
    interview.status !== "completed" &&
    (isOngoing || isExpired);

  const needsConfirmation =
    isHR &&
    past &&
    app?.status === "interview_scheduled" &&
    !confirmed;

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700",
    confirmed: "bg-green-50 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-50 text-red-700",
    rescheduled: "bg-yellow-50 text-yellow-700",
    no_show: "bg-red-50 text-red-600",
    ongoing: "bg-green-100 text-green-700",
  };

  const displayStatus =
    interview.status === "scheduled" && isOngoing
      ? "ongoing"
      : interview.status === "scheduled" && isExpired
      ? "completed"
      : interview.status;

  const handleTypeSelection = async (type: "online" | "in_person") => {
    const formData = new FormData();
    formData.append("interview_id", interview.id);
    formData.append("interview_type", type);
    await updateInterviewPreference(formData);
  };

  const handleConfirmInterview = async () => {
    setConfirming(true);
    setCompleteError(null);

    try {
      const result = await confirmInterviewDone(interview.id);
      if (!result.success) {
        throw new Error(result.error || "Failed to confirm interview");
      }

      setConfirmed(true);
      setIsCompletedLocally(true);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to confirm interview";
      setCompleteError(message);
      console.error("Failed to confirm interview:", error);
    } finally {
      setConfirming(false);
    }
  };

  // ── Type selection ───────────────────────────────────────────────────────
  if (isSelecting && showTypeSelection && !past) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {isHR ? candidateName : jobTitle}
            </p>
            <p className="text-xs text-text-secondary">Choose interview type</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[displayStatus] ?? "bg-gray-100 text-gray-600"}`}>
            {displayStatus.replace("_", " ")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleTypeSelection("online")}
            className="rounded-xl border-2 border-primary bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10"
          >
            <p className="text-lg mb-1">🎥</p>
            <p className="text-sm font-medium text-text-primary">Online</p>
            <p className="text-xs text-text-secondary">Video Call</p>
          </button>
          <button
            onClick={() => handleTypeSelection("in_person")}
            className="rounded-xl border-2 border-border bg-surface p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <p className="text-lg mb-1">🏢</p>
            <p className="text-sm font-medium text-text-primary">In-Person</p>
            <p className="text-xs text-text-secondary">Office Visit</p>
          </button>
        </div>
        <button
          onClick={() => setIsSelecting(false)}
          className="w-full rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Main card ────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-2xl bg-surface border border-border p-4 space-y-3 ${past ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {isHR ? candidateName : jobTitle}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {isHR ? jobTitle : "Interview"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[displayStatus] ?? "bg-gray-100 text-gray-600"}`}>
          {displayStatus === "ongoing" ? "🟢 Ongoing" : displayStatus.replace(/_/g, " ")}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM10.25 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM9.5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM7.25 8.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z" />
            <path fillRule="evenodd" d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
          {" · "}{interview.duration_minutes} min
        </span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${interview.interview_type === "online" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"}`}>
          {interview.interview_type === "online" ? "Online" : "In-person"}
        </span>
      </div>

      {/* Join button */}
      {canJoinRoom && (
        <button
          onClick={() => {
            if (isExpired) return;
            router.push(`/interviews/${interview.id}/room`);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.25 4A2.25 2.25 0 0 0 1 6.25v7.5A2.25 2.25 0 0 0 3.25 16h7.5A2.25 2.25 0 0 0 13 13.75v-7.5A2.25 2.25 0 0 0 10.75 4h-7.5ZM19 4.75a.75.75 0 0 0-1.28-.53l-3 3a.75.75 0 0 0-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 0 0 1.28-.53V4.75Z" />
          </svg>
          Join Meeting
        </button>
      )}

      {needsConfirmation && (
        <button
          onClick={() => void handleConfirmInterview()}
          disabled={confirming}
          className="mt-3 w-full rounded-xl bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {confirming ? "Confirming..." : "Confirm Interview"}
        </button>
      )}

      {confirmed && past && interview.status !== "cancelled" && (
        <div className="mt-3 rounded-xl bg-green-50 border border-green-200 py-2 text-center text-sm font-medium text-green-700">
          ✓ Interview confirmed — applicant moved to Interviewed
        </div>
      )}

      {/* Confirm Interview — HR only, visible when ongoing or expired */}
      {canCompleteInterview && (
        <div className="mt-3">
          <button
            onClick={() => void handleConfirmInterview()}
            disabled={confirming}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Confirm Interview"}
          </button>
        </div>
      )}

      {completeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {completeError}
        </div>
      )}

      {/* Expired room message */}
      {interview.interview_type === "online" && interview.video_room_url && isExpired && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          The meeting window has ended — this room is no longer available.
        </div>
      )}

      {/* Room not yet open */}
      {interview.interview_type === "online" &&
        interview.video_room_url &&
        !isOngoing &&
        !isExpired &&
        interview.status !== "completed" &&
        interview.status !== "cancelled" && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            Room opens 15 minutes before the scheduled time.
          </div>
        )}

      {/* In-person location */}
      {interview.interview_type === "in_person" && interview.location_address && (
        <p className="text-xs text-text-secondary bg-amber-50 rounded-xl px-3 py-2">
          📍 {interview.location_address}
          {interview.location_notes && ` — ${interview.location_notes}`}
        </p>
      )}

      {/* Change type (applicant only) */}
      {showTypeSelection && !past && !isSelecting && (
        <button
          onClick={() => setIsSelecting(true)}
          className="w-full rounded-lg text-sm text-primary hover:bg-primary/5 px-3 py-2 transition-colors"
        >
          Change interview type
        </button>
      )}
    </div>
  );
}
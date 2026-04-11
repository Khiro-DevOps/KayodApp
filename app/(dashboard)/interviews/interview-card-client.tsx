"use client";

import { Interview } from "@/lib/types";
import { updateInterviewPreference } from "../actions";
import { useState } from "react";

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
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedType, setSelectedType] = useState(interview.interview_type);

  const app = interview.applications as unknown as {
    profiles?: { first_name: string; last_name: string; email: string };
    job_postings?: { title: string };
  };

  const candidateName = app?.profiles
    ? `${app.profiles.first_name} ${app.profiles.last_name}`
    : "Candidate";
  const jobTitle = app?.job_postings?.title ?? "Position";
  const scheduledDate = new Date(interview.scheduled_at);

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700",
    confirmed: "bg-green-50 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-50 text-red-700",
    rescheduled: "bg-yellow-50 text-yellow-700",
    no_show: "bg-red-50 text-red-600",
  };

  const handleTypeSelection = async (type: "online" | "in_person") => {
    const formData = new FormData();
    formData.append("interview_id", interview.id);
    formData.append("interview_type", type);
    await updateInterviewPreference(formData);
  };

  if (isSelecting && showTypeSelection && !past) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {isHR ? candidateName : jobTitle}
            </p>
            <p className="text-xs text-text-secondary truncate">
              Choose interview type
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              statusColors[interview.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {interview.status.replace("_", " ")}
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

  return (
    <div
      className={`rounded-2xl bg-surface border border-border p-4 space-y-3 ${
        past ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {isHR ? candidateName : jobTitle}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {isHR ? jobTitle : "Interview"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[interview.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {interview.status.replace("_", " ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM10.25 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM9.5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM7.25 8.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z" />
            <path
              fillRule="evenodd"
              d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5Z"
              clipRule="evenodd"
            />
          </svg>
          {scheduledDate.toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z"
              clipRule="evenodd"
            />
          </svg>
          {scheduledDate.toLocaleTimeString("en-PH", {
            hour: "numeric",
            minute: "2-digit",
          })}
          {" · "}
          {interview.duration_minutes} min
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            interview.interview_type === "online"
              ? "bg-purple-50 text-purple-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {interview.interview_type === "online" ? "Online" : "In-person"}
        </span>
      </div>

      {interview.interview_type === "online" && interview.video_room_url && !past && (
        <a
          href={`/interviews/${interview.id}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.25 4A2.25 2.25 0 0 0 1 6.25v7.5A2.25 2.25 0 0 0 3.25 16h7.5A2.25 2.25 0 0 0 13 13.75v-7.5A2.25 2.25 0 0 0 10.75 4h-7.5ZM19 4.75a.75.75 0 0 0-1.28-.53l-3 3a.75.75 0 0 0-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 0 0 1.28-.53V4.75Z" />
          </svg>
          Join video call
        </a>
      )}

      {interview.interview_type === "in_person" && interview.location_address && (
        <p className="text-xs text-text-secondary bg-amber-50 rounded-xl px-3 py-2">
          📍 {interview.location_address}
          {interview.location_notes && ` — ${interview.location_notes}`}
        </p>
      )}

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

"use client";

import type { Interview } from "@/lib/types";

interface InterviewTimelineProps {
  interviews: Interview[];
  isRecruiter: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-50 text-blue-700", icon: "📅" },
  confirmed: { label: "Confirmed", color: "bg-green-50 text-green-700", icon: "✓" },
  completed: { label: "Completed", color: "bg-purple-50 text-purple-700", icon: "✓" },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-700", icon: "✗" },
  rescheduled: { label: "Rescheduled", color: "bg-yellow-50 text-yellow-700", icon: "🔄" },
  no_show: { label: "No Show", color: "bg-red-50 text-red-700", icon: "✗" },
};

export default function InterviewTimeline({ interviews, isRecruiter }: InterviewTimelineProps) {
  if (!interviews.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-6">Interview History</h3>

      <div className="space-y-4">
        {interviews.map((interview, index) => {
          const config = statusConfig[interview.status] || { label: interview.status, color: "bg-gray-50 text-gray-700", icon: "•" };
          const scheduledDate = new Date(interview.scheduled_at);

          return (
            <div
              key={interview.id}
              className="relative pb-6 last:pb-0"
            >
              {/* Timeline connector */}
              {index < interviews.length - 1 && (
                <div className="absolute left-5 top-10 h-6 w-0.5 bg-border" />
              )}

              {/* Timeline dot and content */}
              <div className="flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 flex-shrink-0 pt-1">
                  <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center font-lg`}>
                    {config.icon}
                  </div>
                </div>

                {/* Content card */}
                <div className="flex-1 rounded-lg border border-border bg-gray-50 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">
                        {interview.interview_type === "online" ? "🎥" : "📍"}{" "}
                        {interview.interview_type === "online" ? "Online Interview" : "In-Person Interview"}
                      </h4>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </div>

                  {/* Date and time */}
                  <div className="text-sm text-text-secondary mb-3">
                    <p>
                      {scheduledDate.toLocaleString(undefined, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs mt-1">Duration: {interview.duration_minutes} minutes</p>
                  </div>

                  {/* Interview details */}
                  <div className="space-y-2 text-sm">
                    {interview.interview_type === "in_person" && interview.location_address && (
                      <div className="flex items-start gap-2">
                        <span>📍</span>
                        <div>
                          <p className="text-text-secondary font-medium">Location</p>
                          <p className="text-text-primary">{interview.location_address}</p>
                          {interview.location_notes && (
                            <p className="text-xs text-text-secondary mt-1">{interview.location_notes}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {interview.interview_type === "online" && interview.video_room_url && (
                      <div className="flex items-start gap-2">
                        <span>🎥</span>
                        <div>
                          <p className="text-text-secondary font-medium">Join Video Call</p>
                          <a
                            href={interview.video_room_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs mt-1 inline-block"
                          >
                            Open Meeting Room →
                          </a>
                        </div>
                      </div>
                    )}

                    {interview.timezone && (
                      <div className="flex items-center gap-2 text-text-secondary">
                        <span>🕐</span>
                        <p>{interview.timezone}</p>
                      </div>
                    )}
                  </div>

                  {/* Recruiter notes */}
                  {isRecruiter && (
                    <>
                      {interview.status === "completed" && (
                        <div className="mt-4 pt-4 border-t border-border space-y-2">
                          <div>
                            <p className="text-xs font-medium text-text-secondary">Interview Score</p>
                            {interview.interview_score !== null ? (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="text-lg font-bold text-text-primary">
                                  {interview.interview_score}/100
                                </div>
                                <div className="flex-1 bg-gray-300 rounded-full h-2">
                                  <div
                                    className={`h-full rounded-full ${
                                      interview.interview_score >= 70
                                        ? "bg-green-500"
                                        : interview.interview_score >= 40
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                    }`}
                                    style={{ width: `${interview.interview_score}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-text-secondary mt-1">Not yet scored</p>
                            )}
                          </div>

                          {interview.interviewer_notes && (
                            <div>
                              <p className="text-xs font-medium text-text-secondary">Notes</p>
                              <p className="text-sm text-text-secondary mt-1 bg-white p-2 rounded border border-border">
                                {interview.interviewer_notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

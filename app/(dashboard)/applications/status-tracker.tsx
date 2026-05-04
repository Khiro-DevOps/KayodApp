"use client";

import Link from "next/link";
import type { ApplicationStatus, Interview } from "@/lib/types";
import { isActiveInterview } from "@/lib/interviews";

interface StatusTrackerProps {
  status: ApplicationStatus;
  interviews: Interview[];
  applicationId?: string;
}

const statusStages = [
  { key: "submitted", label: "Application Submitted", icon: "✓" },
  { key: "under_review", label: "Under Review", icon: "👁" },
  { key: "shortlisted", label: "Shortlisted", icon: "⭐" },
  { key: "interview_scheduled", label: "Interview Scheduled", icon: "📅" },
  { key: "interviewed", label: "Interviewed", icon: "💬" },
  { key: "offer_sent", label: "Offer Sent", icon: "🎉" },
  { key: "hired", label: "Hired", icon: "✅" },
];

export default function StatusTracker({ status, interviews, applicationId }: StatusTrackerProps) {
  const currentStageIndex = statusStages.findIndex((s) => s.key === status);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-6">Application Pipeline</h3>

      <div className="space-y-4">
        {statusStages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;

          return (
            <div key={stage.key} className="flex gap-4">
              {/* Status Indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold transition-colors ${
                    isCompleted
                      ? "bg-green-100 text-green-700"
                      : isCurrent
                      ? "bg-primary text-white ring-2 ring-primary ring-offset-2"
                      : "bg-gray-100 text-text-secondary"
                  }`}
                >
                  {stage.icon}
                </div>
                {index < statusStages.length - 1 && (
                  <div
                    className={`w-1 h-12 mt-2 transition-colors ${
                      isCompleted ? "bg-green-200" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>

              {/* Stage Info */}
              <div className="flex-1 pt-2">
                <p
                  className={`text-sm font-medium transition-colors ${
                    isCurrent
                      ? "text-primary"
                      : isCompleted
                      ? "text-green-700"
                      : "text-text-secondary"
                  }`}
                >
                  {stage.label}
                </p>

                {isCurrent && (
                  <p className="text-xs text-text-secondary mt-1">
                    You are currently at this stage
                  </p>
                )}

                {isCompleted && (
                  <p className="text-xs text-green-700 mt-1">✓ Completed</p>
                )}

                {/* Interview Details */}
                {stage.key === "interview_scheduled" && interviews.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {interviews
                      .filter((i) => isActiveInterview(i))
                      .map((interview) => (
                        <div
                          key={interview.id}
                          className="text-xs bg-blue-50 border border-blue-200 rounded-lg p-2 text-blue-800"
                        >
                          <p className="font-medium">
                            📅{" "}
                            {new Date(interview.scheduled_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-1">
                            {interview.interview_type === "online"
                              ? "🎥 Online Interview"
                              : "📍 In-Person Interview"}
                          </p>
                          {interview.location_address && (
                            <p className="mt-1">{interview.location_address}</p>
                          )}
                          {interview.interview_type === "online" && interview.video_room_url && (
                            <Link
                              href="/interviews"
                              className="mt-2 inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700"
                            >
                              Join Meeting Room
                            </Link>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {stage.key === "interviewed" && interviews.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {interviews
                      .filter((i) => i.status === "completed")
                      .map((interview) => (
                        <div key={interview.id} className="text-xs bg-purple-50 border border-purple-200 rounded-lg p-2 text-purple-800">
                          <p className="font-medium">✓ Interview Completed</p>
                          <p className="mt-1">{new Date(interview.scheduled_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Message */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-sm text-blue-900">
          {status === "submitted" &&
            "Your application has been received. We'll review it and get back to you soon."}
          {status === "under_review" &&
            "Your application is being reviewed by our team. This usually takes 3-5 business days."}
          {status === "shortlisted" &&
            "Congratulations! You've been shortlisted. We'll contact you soon to schedule an interview."}
          {status === "interview_scheduled" &&
            "Great! Your interview has been scheduled. Please check the details above."}
          {status === "interviewed" &&
            "Thank you for your interview! We're reviewing your performance and will be in touch soon."}
          {status === "offer_sent" &&
            "Excellent! We're pleased to extend you a job offer. Check your email for details."}
          {status === "hired" &&
            "Welcome to the team! We're excited to have you on board. Check your email for next steps."}
          {status === "rejected" &&
            "Thank you for your interest. We've decided to move forward with other candidates."}
          {status === "withdrawn" &&
            "You've withdrawn your application."}
        </p>
      </div>

      {/* Action: context-aware CTA */}
      <div className="mt-4 flex justify-end">
        {(() => {
          const upcomingInterview = interviews.find(
            (i) =>
              isActiveInterview(i) &&
              i.interview_type === "online" &&
              i.video_room_url
          );

          if (upcomingInterview?.video_room_url) {
            return (
              <Link
                href="/interviews"
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
              >
                🎥 Join Scheduled Interview
              </Link>
            );
          }

          if (applicationId) {
            return (
              <Link
                href={`/applications/${applicationId}`}
                className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                View Application
              </Link>
            );
          }

          return null;
        })()}
      </div>
    </div>
  );
}
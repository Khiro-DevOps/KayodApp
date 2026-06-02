"use client";

import { useRouter } from "next/navigation";
import type { ApplicationStatus, Interview } from "@/lib/types";
import { isActiveInterview } from "@/lib/interviews";

interface StatusTrackerProps {
  status: ApplicationStatus;
  interviews: Interview[];
  applicationId: string;
  offerRouteId?: string | null;
  activeOffer?: {
    id: string;
    status: string;
  } | null;
}

const statusStages = [
  { key: "submitted", label: "Application Submitted", icon: "✓" },
  { key: "under_review", label: "Under Review", icon: "👁" },
  { key: "shortlisted", label: "Shortlisted", icon: "⭐" },
  { key: "interview_scheduled", label: "Interview Scheduled", icon: "📅" },
  { key: "interviewed", label: "Interviewed", icon: "💬" },
  { key: "offer_sent", label: "Offer Sent", icon: "🎉" },
  { key: "pre_employment", label: "Pre-employment", icon: "🧭" },
  { key: "hired", label: "Hired", icon: "✅" },
];

export default function StatusTracker({ status, interviews, applicationId, offerRouteId, activeOffer }: StatusTrackerProps) {
  const router = useRouter();
  const normalizedStatus = String(status || "").toLowerCase();
  const displayStatus = normalizedStatus === "negotiating" ? "offer_sent" : normalizedStatus;
  const currentStageIndex = statusStages.findIndex((s) => s.key === displayStatus);
  const subStatusLabel = normalizedStatus === "negotiating" ? "Negotiating" : null;
  const normalizedOfferStatus = String(activeOffer?.status ?? "").toLowerCase();
  const hasResolvedOffer = Boolean(offerRouteId || activeOffer?.id);
  const showOfferAction = normalizedStatus === "offer_sent" || normalizedStatus === "negotiating";
  const hasActiveOfferStatus = ["sent", "signed", "pending", "negotiating", "hired", "declined"].includes(
    normalizedOfferStatus
  );

  const handleNegotiatingClick = () => {
    router.push("/offer-signing");
  };

  const handleOfferPipelineClick = async () => {
    const targetId = offerRouteId ?? activeOffer?.id;
    if (!targetId) return;
    const path = `/job-offer/${encodeURIComponent(targetId)}`;
    try {
      await router.prefetch(path);
    } catch {
      // ignore prefetch errors
    }
    router.push(path);
  };

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

                {isCurrent && subStatusLabel && (
                  <button
                    type="button"
                    onClick={handleNegotiatingClick}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline transition-colors"
                    aria-label="View and negotiate offer"
                  >
                    <span>Status: {subStatusLabel} (Click to view/negotiate offer)</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                )}

                {isCurrent && showOfferAction && offerRouteId && (
                  <button
                    type="button"
                    onClick={handleOfferPipelineClick}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 hover:underline transition-colors"
                    aria-label="View offer"
                  >
                    <span>Status: Offer available (Click to view)</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                )}

                {stage.key === "offer_sent" && isCurrent && (
                  <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                    {showOfferAction && hasResolvedOffer && hasActiveOfferStatus ? (
                      <>
                        <p className="font-medium">✓ Offer Sent</p>
                        <p className="mt-1">Your offer is ready for signing or negotiation.</p>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={handleOfferPipelineClick}
                            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary py-2 px-3 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                          >
                            View Offer
                            <span aria-hidden="true">↗</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Offer stage active</p>
                        <p className="mt-1">HR is preparing the offer. You will see it here once it is sent.</p>
                      </>
                    )}
                  </div>
                )}

                {stage.key === "pre_employment" && isCurrent && (
                  <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-800">
                    <p className="font-medium text-sky-900">Signature recorded</p>
                    <p className="mt-1 text-sm text-sky-700">
                      You are in pre-employment. Open your documents page to complete the remaining onboarding requirements.
                    </p>
                    {applicationId && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/apply/applications/${encodeURIComponent(applicationId)}/documents`)}
                          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
                        >
                          Open documents
                          <span aria-hidden="true">↗</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isCompleted && (
                  <p className="text-xs text-green-700 mt-1">✓ Completed</p>
                )}

                {/* Interview Details */}
                {stage.key === "interview_scheduled" && interviews.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {interviews
                      .filter((i) => isActiveInterview(i))
                      .map((interview) => {
                        const scheduledDate = new Date(interview.scheduled_at);
                        const now = new Date();
                        const minutesUntil = Math.floor((scheduledDate.getTime() - now.getTime()) / 60000);
                        const endTime = new Date(scheduledDate.getTime() + (interview.duration_minutes ?? 60) * 60000);
                        const isOngoing = now >= new Date(scheduledDate.getTime() - 15 * 60000) && now < endTime;
                        const canJoin = isOngoing && interview.status !== "cancelled" && interview.status !== "completed";
                        return (
                          <div key={interview.id} className="text-xs bg-blue-50 border border-blue-200 rounded-lg p-2 text-blue-800">
                            <p className="font-medium">📅 {scheduledDate.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            <p className="mt-1">{interview.interview_type === "online" ? "🎥 Online Interview" : "📍 In-Person Interview"}</p>
                            {interview.location_address && <p className="mt-1">{interview.location_address}</p>}

                            {interview.interview_type === "online" && interview.video_room_url && (
                              <div className="mt-2">
                                {canJoin ? (
                                  <button
                                    onClick={() => router.push(`/interviews?id=${interview.id}`)}
                                    className="mt-2 w-full rounded-xl bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                                  >
                                    Join Meeting
                                  </button>
                                ) : (
                                  <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 mt-2">
                                    {interview.status === "completed"
                                      ? "This interview has been completed."
                                      : interview.status === "cancelled"
                                      ? "This interview was cancelled."
                                      : `Room opens 15 minutes before the scheduled time. Opens in ${minutesUntil}m.`}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                {/* HR review note for interviewed stage (applicant-facing) */}
                {stage.key === "interviewed" && status === "interviewed" && (
                  <div className="mt-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
                    Under review by HR — please wait for updates.
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
          {status === "negotiating" &&
            "Your offer is now in negotiation. Please review the offer details above and respond when ready."}
          {status === "offer_sent" &&
            "Excellent! We're pleased to extend you a job offer. Check your email for details."}
          {status === "pre_employment" &&
            "Signature recorded. Open your documents page to continue onboarding."}
          {status === "hired" &&
            "Welcome to the team! We're excited to have you on board. Check your email for next steps."}
          {status === "rejected" &&
            "Thank you for your interest. We've decided to move forward with other candidates."}
          {status === "withdrawn" &&
            "You've withdrawn your application."}
        </p>
      </div>

    </div>
  );
}
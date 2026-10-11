"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPhtDate, formatPhtTime } from "@/lib/interview-date";
import JoinInterviewButton from "@/components/interviews/JoinInterviewButton";
import { cancelInterviewSchedule } from "@/app/actions/interviews";

export interface InterviewScheduleItem {
  id: string;
  application_id: string;
  status: string;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  meeting_type?: string | null;
  meeting_link?: string | null;
  proposed_slots?: any;
  selected_slot?: any;
  office_branches?: {
    name?: string | null;
    address?: string | null;
  } | null;
}

interface HRInterviewCardSectionProps {
  interview?: InterviewScheduleItem | null;
  applicationId: string;
  compact?: boolean; // compact mode for Kanban card
  onReschedule?: () => void;
  onCancelSuccess?: () => void;
}

export default function HRInterviewCardSection({
  interview,
  applicationId,
  compact = false,
  onReschedule,
  onCancelSuccess,
}: HRInterviewCardSectionProps) {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const status = interview?.status;
  const isNone = !interview || !status;
  const isProposed = status === "proposed" || status === "pending_selection";
  const isScheduled = status === "scheduled" || status === "rescheduled" || status === "confirmed";
  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";

  const modeLabel = (() => {
    switch (interview?.meeting_type) {
      case "in_person":
        return "In-person";
      case "hybrid":
        return "Hybrid";
      case "online":
      default:
        return "Online";
    }
  })();

  const handleReschedule = () => {
    if (onReschedule) {
      onReschedule();
    } else {
      router.push(`/hr/interviews/schedule?applicationId=${encodeURIComponent(applicationId)}`);
    }
  };

  const handleConfirmCancel = async () => {
    if (!interview?.id) return;
    setIsCancelling(true);
    try {
      const res = await cancelInterviewSchedule(interview.id);
      if (res.success) {
        toast.success("Interview cancelled successfully.");
        setShowConfirmCancel(false);
        if (onCancelSuccess) onCancelSuccess();
        router.refresh();
      } else {
        toast.error(res.error || "Failed to cancel interview.");
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred.");
    } finally {
      setIsCancelling(false);
    }
  };

  if (isNone) {
    return (
      <div className="space-y-2">
        {!compact && (
          <p className="text-xs text-text-muted">No interview scheduled yet.</p>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleReschedule();
          }}
          className="w-full rounded-lg bg-primary hover:bg-primary-hover px-3 py-2 text-xs font-semibold text-white transition-colors shadow-xs"
        >
          Schedule Room/Interview
        </button>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="space-y-2">
        <span className="inline-flex rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
          Completed
        </span>
        {!compact && (
          <p className="text-xs text-text-muted mt-1">This interview has been completed.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Badge Display */}
      {isProposed && (
        <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
          Proposed · awaiting candidate
        </span>
      )}

      {isScheduled && (
        <div className="space-y-1">
          <span className="inline-flex rounded-full bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 text-xs font-semibold">
            Scheduled · {formatPhtDate(interview.scheduled_at)}, {formatPhtTime(interview.scheduled_at)} · {modeLabel}
          </span>

          {!compact && (
            <div className="mt-2 space-y-1 text-xs text-text-muted rounded-lg border border-border bg-surface-bg p-3">
              <p><strong className="text-text-main">Duration:</strong> {interview.duration_minutes || 60} mins</p>
              <p><strong className="text-text-main">Mode:</strong> {modeLabel}</p>
              {interview.office_branches && (
                <p>
                  <strong className="text-text-main">Location:</strong> {interview.office_branches.name}
                  {interview.office_branches.address ? `, ${interview.office_branches.address}` : ""}
                </p>
              )}
              {interview.meeting_link && (
                <p className="truncate">
                  <strong className="text-text-main">Link:</strong>{" "}
                  <a href={interview.meeting_link} target="_blank" rel="noreferrer" className="text-primary underline">
                    {interview.meeting_link}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isCancelled && (
        <span className="inline-flex rounded-full bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 text-xs font-semibold">
          Cancelled
        </span>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {(isProposed || isScheduled || isCancelled) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleReschedule();
            }}
            className="rounded-lg border border-border bg-card-bg hover:bg-surface-bg px-3 py-1.5 text-xs font-semibold text-text-main transition-colors"
          >
            Reschedule
          </button>
        )}

        {(isProposed || isScheduled) && (
          <>
            {!showConfirmCancel ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmCancel(true);
                }}
                className="rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleConfirmCancel();
                  }}
                  className="rounded-lg bg-red-600 hover:bg-red-700 px-2.5 py-1 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {isCancelling ? "Cancelling..." : "Confirm Cancel"}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmCancel(false);
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-muted hover:text-text-main"
                >
                  Back
                </button>
              </div>
            )}
          </>
        )}

        {isScheduled && (
          <JoinInterviewButton
            interviewId={interview.id}
            meetingLink={interview.meeting_link}
            scheduledAt={interview.scheduled_at}
            durationMinutes={interview.duration_minutes}
            status={interview.status}
            meetingType={interview.meeting_type}
            selectedSlot={interview.selected_slot}
          />
        )}
      </div>
    </div>
  );
}

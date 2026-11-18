"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import HRInterviewCardSection, { type InterviewScheduleItem } from "@/components/hr/HRInterviewCardSection";
import { completeInterview } from "@/app/(dashboard)/hr/interviews/actions";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  InterviewNotesScorecardSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
} from "./shared";

export interface InterviewStageBodyProps {
  application: ApplicationHubCard;
  interview?: InterviewScheduleItem | null;
  scoreDisplay?: string | null;
  onReject: (applicationId: string) => void;
  onAdvance: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
  onSchedule: (application: ApplicationHubCard) => void;
  onInterviewUpdated?: () => void;
}

export default function InterviewStageBody({
  application,
  interview,
  scoreDisplay,
  onReject,
  onAdvance,
  onOpenFullApplication,
  onSchedule,
  onInterviewUpdated,
}: InterviewStageBodyProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmIncompleteMove, setConfirmIncompleteMove] = useState(false);

  const isScheduled = interview?.status === "scheduled";
  const isCompleted = interview?.status === "completed";

  const handleMarkComplete = () => {
    if (!interview?.id) return;
    startTransition(async () => {
      const res = await completeInterview({
        interviewId: interview.id,
        outcome: "hold",
        meetingType: (interview.meeting_type as "online" | "in_person" | "hybrid" | undefined) ?? "online",
      });

      if (!res.success) {
        toast.error(res.error || "Failed to mark interview complete.");
        return;
      }

      toast.success("Interview marked complete.");
      onInterviewUpdated?.();
    });
  };

  const handleMoveToOfferClick = () => {
    if (!isCompleted && !confirmIncompleteMove) {
      setConfirmIncompleteMove(true);
      return;
    }
    setConfirmIncompleteMove(false);
    onAdvance(application.id);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="interview" scoreDisplay={scoreDisplay} />

        <section className="rounded-xl border border-card-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
              Interview Coordination
            </h3>
            {isScheduled && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleMarkComplete}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Mark complete"}
              </button>
            )}
          </div>

          <HRInterviewCardSection
            interview={interview}
            applicationId={application.id}
            compact={false}
            onReschedule={() => onSchedule(application)}
            onCancelSuccess={onInterviewUpdated}
          />
        </section>

        <MatchBreakdownSection application={application} stageKey="interview" scoreDisplay={scoreDisplay} />
        <InterviewNotesScorecardSection interview={interview} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>

      <div className="border-t border-card-border p-6 space-y-3">
        {confirmIncompleteMove && !isCompleted && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs text-amber-900">
            <p className="font-semibold">
              Warning: This candidate&apos;s interview has not been marked completed yet. Advance to Offer &amp; Contract anyway?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmIncompleteMove(false)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmIncompleteMove(false);
                  onAdvance(application.id);
                }}
                className="rounded-lg bg-amber-700 px-3 py-1.5 font-semibold text-white hover:bg-amber-800"
              >
                Confirm Move
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onReject(application.id)}
            className="rounded-lg border border-error px-4 py-3 text-[13px] font-semibold text-error transition-colors hover:bg-error/10"
          >
            Reject
          </button>

          <button
            type="button"
            onClick={handleMoveToOfferClick}
            className="rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Move to Offer &amp; Contract
          </button>
        </div>
      </div>
    </div>
  );
}

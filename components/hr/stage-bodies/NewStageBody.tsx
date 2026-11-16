"use client";

import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
} from "./shared";

export interface NewStageBodyProps {
  application: ApplicationHubCard;
  scoreDisplay?: string | null;
  onReject: (applicationId: string) => void;
  onAdvance: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
}

export default function NewStageBody({
  application,
  scoreDisplay,
  onReject,
  onAdvance,
  onOpenFullApplication,
}: NewStageBodyProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="new" scoreDisplay={scoreDisplay} />
        <MatchBreakdownSection application={application} stageKey="new" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-card-border p-6">
        <button
          type="button"
          onClick={() => onReject(application.id)}
          className="rounded-lg border border-error px-4 py-3 text-[13px] font-semibold text-error transition-colors hover:bg-error/10"
        >
          Reject
        </button>

        <button
          type="button"
          onClick={() => onAdvance(application.id)}
          className="rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Move to Screening
        </button>
      </div>
    </div>
  );
}

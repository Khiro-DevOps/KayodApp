"use client";

import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
} from "./shared";

export interface RejectedStageBodyProps {
  application: ApplicationHubCard;
  scoreDisplay?: string | null;
  onOpenFullApplication: (applicationId: string) => void;
}

export default function RejectedStageBody({
  application,
  scoreDisplay,
  onOpenFullApplication,
}: RejectedStageBodyProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="closed" scoreDisplay={scoreDisplay} />
        <MatchBreakdownSection application={application} stageKey="closed" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>
    </div>
  );
}

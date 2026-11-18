"use client";

import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import type { InterviewScheduleItem } from "@/components/hr/HRInterviewCardSection";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  InterviewNotesScorecardSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
} from "./shared";

export interface RejectedStageBodyProps {
  application: ApplicationHubCard;
  interview?: InterviewScheduleItem | null;
  scoreDisplay?: string | null;
  onOpenFullApplication: (applicationId: string) => void;
}

export default function RejectedStageBody({
  application,
  interview,
  scoreDisplay,
  onOpenFullApplication,
}: RejectedStageBodyProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="closed" scoreDisplay={scoreDisplay} />
        <MatchBreakdownSection application={application} stageKey="closed" scoreDisplay={scoreDisplay} />
        <InterviewNotesScorecardSection interview={interview} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>
    </div>
  );
}

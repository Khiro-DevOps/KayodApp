"use client";

import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
  formatApplicationTime,
  getRoleTitle,
  resolveProfile,
} from "./shared";

export interface HiredStageBodyProps {
  application: ApplicationHubCard;
  scoreDisplay?: string | null;
  onViewEmployee: (application: ApplicationHubCard) => void;
  onOpenFullApplication: (applicationId: string) => void;
}

export default function HiredStageBody({
  application,
  scoreDisplay,
  onViewEmployee,
  onOpenFullApplication,
}: HiredStageBodyProps) {
  const profile = resolveProfile(application);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="hired" scoreDisplay={scoreDisplay} />

        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-emerald-900">
              Contract &amp; Hire Info
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Hire Confirmed
            </span>
          </div>
          <p className="text-xs text-emerald-800">
            <strong>Role:</strong> {getRoleTitle(application)}
          </p>
          {profile?.email && (
            <p className="text-xs text-emerald-800">
              <strong>Email:</strong> {profile.email}
            </p>
          )}
          <p className="text-xs text-emerald-800">
            <strong>Updated:</strong> {formatApplicationTime(application.updated_at)}
          </p>
        </section>

        <section className="rounded-xl border border-dashed border-card-border bg-surface p-4">
          <h3 className="text-[12px] font-semibold text-on-surface">
            Pre-employment requirements - coming soon
          </h3>
        </section>

        <MatchBreakdownSection application={application} stageKey="hired" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>

      <div className="border-t border-card-border p-6">
        <button
          type="button"
          onClick={() => onViewEmployee(application)}
          className="w-full rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          View Employee
        </button>
      </div>
    </div>
  );
}

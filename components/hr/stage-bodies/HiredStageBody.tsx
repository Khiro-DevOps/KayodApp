"use client";

import { useEffect, useState } from "react";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import {
  getPreEmploymentChecklist,
  type PreEmploymentChecklistItem,
} from "@/lib/pre-employment-actions";
import type { OnboardingDocumentStatus } from "@/lib/types";
import type { InterviewScheduleItem } from "@/components/hr/HRInterviewCardSection";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  InterviewNotesScorecardSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
  formatApplicationTime,
  getRoleTitle,
  resolveProfile,
} from "./shared";

const STATUS_BADGE_CLASSES: Record<OnboardingDocumentStatus, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
};

export interface HiredStageBodyProps {
  application: ApplicationHubCard;
  interview?: InterviewScheduleItem | null;
  scoreDisplay?: string | null;
  onViewEmployee: (application: ApplicationHubCard) => void;
  onOpenFullApplication: (applicationId: string) => void;
}

export default function HiredStageBody({
  application,
  interview,
  scoreDisplay,
  onViewEmployee,
  onOpenFullApplication,
}: HiredStageBodyProps) {
  const profile = resolveProfile(application);
  const [checklist, setChecklist] = useState<{
    loadedApplicationId: string | null;
    error: string | null;
    items: PreEmploymentChecklistItem[];
    completed: number;
    total: number;
  }>({
    loadedApplicationId: null,
    error: null,
    items: [],
    completed: 0,
    total: 0,
  });
  const isLoading = checklist.loadedApplicationId !== application.id;

  useEffect(() => {
    let active = true;

    getPreEmploymentChecklist(application.id)
      .then((res) => {
        if (!active) return;
        if (!res.success) {
          setChecklist({
            loadedApplicationId: application.id,
            error: res.error || "Failed to load pre-employment requirements",
            items: [],
            completed: 0,
            total: 0,
          });
          return;
        }
        setChecklist({
          loadedApplicationId: application.id,
          error: null,
          items: res.items,
          completed: res.completed,
          total: res.total,
        });
      })
      .catch(() => {
        if (!active) return;
        setChecklist({
          loadedApplicationId: application.id,
          error: "Failed to load pre-employment requirements",
          items: [],
          completed: 0,
          total: 0,
        });
      });

    return () => {
      active = false;
    };
  }, [application.id]);

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

        <section className="rounded-xl border border-card-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold text-on-surface">
              Pre-employment requirements
            </h3>
            {!isLoading && !checklist.error && (
              <span className="text-xs font-medium text-on-surface-variant">
                {checklist.completed} of {checklist.total} complete
              </span>
            )}
          </div>

          {isLoading ? (
            <p className="text-xs text-on-surface-variant">
              Loading pre-employment requirements...
            </p>
          ) : checklist.error ? (
            <p className="text-xs text-rose-700">{checklist.error}</p>
          ) : checklist.items.length === 0 ? (
            <p className="text-xs text-on-surface-variant">
              No pre-employment requirements found.
            </p>
          ) : (
            <ul className="divide-y divide-card-border">
              {checklist.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-xs text-on-surface">{item.label}</span>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_BADGE_CLASSES[item.status]}`}
                  >
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <MatchBreakdownSection application={application} stageKey="hired" scoreDisplay={scoreDisplay} />
        <InterviewNotesScorecardSection interview={interview} />
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

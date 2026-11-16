"use client";

import { useEffect, useState } from "react";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import { ScheduleInterviewDrawer } from "@/app/(dashboard)/hr/interviews/_components/ScheduleInterviewDrawer";
import { createClient } from "@/lib/supabase/client";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
  getApplicantName,
  getRoleTitle,
  resolveProfile,
} from "./shared";

export interface ScreeningStageBodyProps {
  application: ApplicationHubCard;
  scoreDisplay?: string | null;
  onReject: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
  onInterviewScheduled?: () => void;
}

export default function ScreeningStageBody({
  application,
  scoreDisplay,
  onReject,
  onOpenFullApplication,
  onInterviewScheduled,
}: ScreeningStageBodyProps) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [interviewers, setInterviewers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadInterviewers = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id;
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role")
        .in("role", ["hr_manager", "admin", "interviewer", "hr"]);

      if (!isMounted) return;
      const list = (data ?? []).map((item: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null }) => ({
        id: item.id,
        name: `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email || "Interviewer",
      }));

      if (currentUserId && !list.some((item: { id: string; name: string }) => item.id === currentUserId)) {
        list.unshift({ id: currentUserId, name: "Current HR User" });
      }
      setInterviewers(list);
    };

    void loadInterviewers();
    return () => {
      isMounted = false;
    };
  }, []);

  const profile = resolveProfile(application);
  const applicationOptions = [
    {
      id: application.id,
      candidateName: getApplicantName(profile),
      jobTitle: getRoleTitle(application),
    },
  ];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="screening" scoreDisplay={scoreDisplay} />
        <MatchBreakdownSection application={application} stageKey="screening" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />

        <section className="rounded-xl border border-card-border bg-surface p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
            Screening Notes
          </h3>
          <p className="whitespace-pre-wrap text-[14px] leading-6 text-secondary">
            {application.hr_notes?.trim() ? application.hr_notes : "No HR notes recorded yet."}
          </p>
        </section>

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
          onClick={() => setIsScheduleOpen(true)}
          className="rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Schedule Interview
        </button>
      </div>

      <ScheduleInterviewDrawer
        isOpen={isScheduleOpen}
        onClose={() => {
          setIsScheduleOpen(false);
          onInterviewScheduled?.();
        }}
        applications={applicationOptions}
        interviewers={interviewers}
        defaultApplicationId={application.id}
      />
    </div>
  );
}

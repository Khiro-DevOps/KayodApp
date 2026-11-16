"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { updateApplicationStatus as updateApplicationStatusAction } from "./hr-applications-actions";
import {
  getStageForStatus,
  getNextDbStatus,
  ACTIVE_STAGES,
  UI_STAGES,
  type UiStageKey,
  type UiStage,
} from "@/lib/application-stages";
import HRInterviewCardSection, { type InterviewScheduleItem } from "@/components/hr/HRInterviewCardSection";
import NewStageBody from "@/components/hr/stage-bodies/NewStageBody";
import ScreeningStageBody from "@/components/hr/stage-bodies/ScreeningStageBody";
import InterviewStageBody from "@/components/hr/stage-bodies/InterviewStageBody";
import OfferStageBody from "@/components/hr/stage-bodies/OfferStageBody";
import HiredStageBody from "@/components/hr/stage-bodies/HiredStageBody";
import RejectedStageBody from "@/components/hr/stage-bodies/RejectedStageBody";


type CandidateProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
};

type JobPostingSummary = {
  id: string;
  title: string;
  location: string | null;
  tenant_id?: string | null;
};

export type ApplicationHubCard = {
  id: string;
  job_id: string;
  candidate_id?: string;
  applicant_id?: string;
  resume_id: string;
  status: string;
  cover_letter: string | null;
  match_score: number | null;
  hr_notes: string | null;
  submitted_at: string;
  updated_at: string;
  // Supabase .select('*, candidate:profiles(*), job:job_postings(*)')
  candidate?: CandidateProfile | CandidateProfile[] | null;
  job?: JobPostingSummary | JobPostingSummary[] | null;
  // Legacy fallback shape
  profiles?: CandidateProfile | CandidateProfile[] | null;
  job_postings?: JobPostingSummary | JobPostingSummary[] | null;
};

type ApplicationsKanbanBoardProps = {
  applications: ApplicationHubCard[];
  currentCompanyId: string;
  tenantJobIds: string[];
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function resolveProfile(application: ApplicationHubCard | null | undefined): CandidateProfile | null {
  if (!application) return null;
  return (
    normalizeRelation(application.candidate) ??
    normalizeRelation(application.profiles) ??
    null
  );
}

function resolveJob(application: ApplicationHubCard | null | undefined): JobPostingSummary | null {
  if (!application) return null;
  return (
    normalizeRelation(application.job) ??
    normalizeRelation(application.job_postings) ??
    null
  );
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getApplicantName(profile: CandidateProfile | null): string {
  if (!profile) {
    return "Unknown Candidate";
  }

  const fullNameField = normalizeText((profile as any).full_name);
  if (fullNameField) return fullNameField;

  const fullName = [normalizeText(profile.first_name), normalizeText(profile.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  const emailHandle = normalizeText((profile.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return emailHandle || "Unknown Candidate";
}

function getApplicantInitials(profile: CandidateProfile | null): string {
  const name = getApplicantName(profile);
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A";
}

/**
 * Format match_score for display.
 * The DB stores match_score as NUMERIC(5,2) which is 0–100 scale.
 * Returns null when the value is null (shows "Not scored yet").
 * Returns a rounded integer string like "72" when scored.
 */
function formatMatchScore(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  // Schema: NUMERIC(5,2) → max 999.99. Values ≤ 1.0 suggest a 0–1 scale; multiply.
  const normalised = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return String(normalised);
}

function getScoreClasses(score: string | null): string {
  if (score === null) {
    return "bg-surface-bg text-text-muted border border-border";
  }

  const n = Number(score);

  if (n >= 70) {
    return "bg-success-bg text-success border border-success/20";
  }

  if (n >= 40) {
    return "bg-warning-bg text-warning border border-warning/20";
  }

  return "bg-surface-bg text-text-muted border border-border";
}

function formatApplicationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently applied";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortApplications(items: ApplicationHubCard[]): ApplicationHubCard[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.submitted_at).getTime();
    const rightTime = new Date(right.submitted_at).getTime();
    return rightTime - leftTime;
  });
}

type GroupedApplications = Record<UiStageKey, ApplicationHubCard[]>;

function groupApplicationsByStage(items: ApplicationHubCard[]): GroupedApplications {
  const grouped: GroupedApplications = {
    new:       [],
    screening: [],
    interview: [],
    offer:     [],
    hired:     [],
    closed:    [],
    other:     [],
  };

  for (const item of items) {
    const stageKey = getStageForStatus(item.status);
    grouped[stageKey].push(item);
  }

  // Sort each bucket by applied time (newest first)
  for (const key of Object.keys(grouped) as UiStageKey[]) {
    grouped[key] = sortApplications(grouped[key]);
  }

  return grouped;
}

function mergeRealtimeApplication(
  current: ApplicationHubCard[] | null | undefined,
  nextRow: ApplicationHubCard,
): ApplicationHubCard[] {
  const rows = current ? [...current] : [];
  const index = rows.findIndex((row) => row.id === nextRow.id);

  if (index === -1) {
    rows.unshift(nextRow);
    return sortApplications(rows);
  }

  rows[index] = {
    ...rows[index],
    ...nextRow,
  };

  return sortApplications(rows);
}

function getCandidateLocation(application: ApplicationHubCard): string {
  const profile = resolveProfile(application);
  const jobPosting = resolveJob(application);
  return profile?.city?.trim() || jobPosting?.location?.trim() || "Remote";
}

function getRoleTitle(application: ApplicationHubCard): string {
  const jobPosting = resolveJob(application);
  return jobPosting?.title?.trim() || "Untitled role";
}

function getStageLabel(stageKey: UiStageKey): string {
  return UI_STAGES.find((stage) => stage.key === stageKey)?.label ?? "New";
}

function getPrimaryActionLabel(stageKey: UiStageKey): string {
  switch (stageKey) {
    case "new":
      return "Screen Candidate";
    case "screening":
      return "View Assessment";
    case "interview":
      return "Schedule Room/Interview";
    case "offer":
      return "Send Offer";
    case "hired":
      return "View Employee";
    case "closed":
      return "Review Candidate";
    default:
      return "View Candidate";
  }
}

function ApplicationCard({
  application,
  interviewSchedule,
  onSelect,
  onPrimaryAction,
  onSchedule,
}: {
  application: ApplicationHubCard;
  interviewSchedule?: InterviewScheduleItem | null;
  onSelect: (applicationId: string) => void;
  onPrimaryAction: (application: ApplicationHubCard) => void;
  onSchedule: (application: ApplicationHubCard) => void;
}) {
  const profile = resolveProfile(application);
  const stageKey = getStageForStatus(application.status);
  const actionLabel = getPrimaryActionLabel(stageKey);
  const scoreDisplay = formatMatchScore(application.match_score);

  return (
    <article
      className="cursor-pointer rounded-xl border border-border bg-card-bg p-4 shadow-xs transition-all duration-200 hover:border-primary hover:shadow-md space-y-3"
      onClick={() => onSelect(application.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {profile?.avatar_url ? (
            <img
              alt={getApplicantName(profile)}
              src={profile.avatar_url}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-dark font-bold text-xs">
              {getApplicantInitials(profile)}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-main">{getApplicantName(profile)}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">
              Applied {formatApplicationTime(application.submitted_at)}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getScoreClasses(scoreDisplay)}`}>
          {scoreDisplay !== null ? `${scoreDisplay}% match` : "Not scored yet"}
        </span>
      </div>

      <div className="space-y-0.5">
        <p className="truncate text-xs font-medium text-text-main">{getRoleTitle(application)}</p>
        <p className="text-xs text-text-muted">{getCandidateLocation(application)}</p>
      </div>

      <div className="flex items-center justify-between text-[10px] font-semibold text-text-muted border-t border-border/40 pt-2 uppercase tracking-wider">
        <span>{getStageLabel(stageKey)}</span>
        <span className="text-text-muted">{application.status}</span>
      </div>

      {stageKey === "interview" ? (
        <div onClick={(e) => e.stopPropagation()}>
          <HRInterviewCardSection
            interview={interviewSchedule}
            applicationId={application.id}
            compact={true}
            onReschedule={() => onSchedule(application)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrimaryAction(application);
          }}
          className="w-full rounded-lg bg-primary hover:bg-primary-hover px-3 py-2 text-xs font-semibold text-white transition-colors shadow-xs"
        >
          {actionLabel}
        </button>
      )}
    </article>
  );
}

function PipelineColumn({
  stage,
  applications,
  interviewMap,
  onSelect,
  onPrimaryAction,
  onSchedule,
}: {
  stage: UiStage;
  applications: ApplicationHubCard[];
  interviewMap: Record<string, InterviewScheduleItem>;
  onSelect: (applicationId: string) => void;
  onPrimaryAction: (application: ApplicationHubCard) => void;
  onSchedule: (application: ApplicationHubCard) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card-bg p-4 min-w-[310px] max-w-[310px] shrink-0 shadow-xs">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-main">{stage.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${stage.badgeClassName}`}>
            {applications.length}
          </span>
        </div>

        <button type="button" className="text-text-muted transition-colors hover:text-text-main" aria-label={`${stage.label} options`}>
          <span className="material-symbols-outlined text-[18px]">more_horiz</span>
        </button>
      </div>

      <p className="mb-3 px-1 text-xs text-text-muted">{stage.description}</p>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 modern-scrollbar">
        {applications.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-border bg-surface-bg px-4 text-center text-xs text-text-muted">
            No candidates yet
          </div>
        ) : (
          applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              interviewSchedule={interviewMap[application.id]}
              onSelect={onSelect}
              onPrimaryAction={onPrimaryAction}
              onSchedule={onSchedule}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ClosedSection({
  applications,
  onSelect,
}: {
  applications: ApplicationHubCard[];
  onSelect: (applicationId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (applications.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-card-bg shadow-xs">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-text-main hover:bg-surface-bg transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-text-muted">
            {isOpen ? "expand_less" : "expand_more"}
          </span>
          <span>Closed</span>
          <span className="rounded-full bg-error-bg text-error border border-error/20 px-2 py-0.5 text-[10px] font-bold">
            {applications.length}
          </span>
        </div>
        <span className="text-[11px] font-normal text-text-muted">Rejected &amp; Withdrawn</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {applications.map((app) => {
            const profile = resolveProfile(app);
            const scoreDisplay = formatMatchScore(app.match_score);
            return (
              <article
                key={app.id}
                className="cursor-pointer rounded-xl border border-border bg-surface-bg p-4 hover:border-primary transition-colors"
                onClick={() => onSelect(app.id)}
              >
                <div className="flex items-center gap-3 mb-2">
                  {profile?.avatar_url ? (
                    <img
                      alt={getApplicantName(profile)}
                      src={profile.avatar_url}
                      className="h-8 w-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-bg text-error font-bold text-xs">
                      {getApplicantInitials(profile)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-main">{getApplicantName(profile)}</p>
                    <p className="text-xs text-text-muted">{getRoleTitle(app)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {app.status}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getScoreClasses(scoreDisplay)}`}>
                    {scoreDisplay !== null ? `${scoreDisplay}%` : "Not scored"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApplicationDrawer({
  application,
  interview,
  isOpen,
  onClose,
  onReject,
  onAdvance,
  onOpenFullApplication,
  onSchedule,
  onViewEmployee,
  onInterviewUpdated,
}: {
  application: ApplicationHubCard | null;
  interview?: InterviewScheduleItem | null;
  isOpen: boolean;
  onClose: () => void;
  onReject: (applicationId: string) => void;
  onAdvance: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
  onSchedule: (application: ApplicationHubCard) => void;
  onViewEmployee: (application: ApplicationHubCard) => void;
  onInterviewUpdated?: () => void;
}) {
  const stageKey = application ? getStageForStatus(application.status) : "new";
  const scoreDisplay = formatMatchScore(application?.match_score);

  const renderStageBody = (app: ApplicationHubCard) => {
    switch (stageKey) {
      case "new":
        return (
          <NewStageBody
            application={app}
            scoreDisplay={scoreDisplay}
            onReject={onReject}
            onAdvance={onAdvance}
            onOpenFullApplication={onOpenFullApplication}
          />
        );
      case "screening":
        return (
          <ScreeningStageBody
            application={app}
            scoreDisplay={scoreDisplay}
            onReject={onReject}
            onOpenFullApplication={onOpenFullApplication}
            onInterviewScheduled={onInterviewUpdated}
          />
        );
      case "interview":
        return (
          <InterviewStageBody
            application={app}
            interview={interview}
            scoreDisplay={scoreDisplay}
            onReject={onReject}
            onAdvance={onAdvance}
            onOpenFullApplication={onOpenFullApplication}
            onSchedule={onSchedule}
            onInterviewUpdated={onInterviewUpdated}
          />
        );
      case "offer":
        return (
          <OfferStageBody
            application={app}
            scoreDisplay={scoreDisplay}
            onReject={onReject}
            onOpenFullApplication={onOpenFullApplication}
          />
        );
      case "hired":
        return (
          <HiredStageBody
            application={app}
            scoreDisplay={scoreDisplay}
            onViewEmployee={onViewEmployee}
            onOpenFullApplication={onOpenFullApplication}
          />
        );
      case "closed":
      case "other":
      default:
        return (
          <RejectedStageBody
            application={app}
            scoreDisplay={scoreDisplay}
            onOpenFullApplication={onOpenFullApplication}
          />
        );
    }
  };

  return (
    <aside
      className={`fixed right-0 top-[56px] z-[110] flex h-[calc(100dvh-56px)] w-full max-w-[440px] transform flex-col border-l border-card-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-center justify-between border-b border-card-border p-6">
        <button type="button" className="text-outline transition-colors hover:text-on-surface" onClick={onClose} aria-label="Close drawer">
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="flex gap-2">
          {/* Placeholder for future share/options actions */}
        </div>
      </div>

      {application ? (
        renderStageBody(application)
      ) : (
        <div className="flex-1 overflow-y-auto p-6 modern-scrollbar">
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-card-border bg-surface p-6 text-center text-[14px] text-secondary">
            Select a candidate to inspect their application details.
          </div>
        </div>
      )}
    </aside>
  );
}

export default function ApplicationsKanbanBoard({
  applications: initialApplications,
  currentCompanyId,
  tenantJobIds,
}: ApplicationsKanbanBoardProps) {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationHubCard[]>(() => sortApplications(initialApplications));
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  );

  const stageColumns = useMemo(() => groupApplicationsByStage(applications), [applications]);
  const totalApplications = applications.length;

  const [interviewMap, setInterviewMap] = useState<Record<string, InterviewScheduleItem>>({});
  const [interviewRefreshTick, setInterviewRefreshTick] = useState(0);
  const applicationIds = useMemo(() => applications.map((a) => a.id), [applications]);

  useEffect(() => {
    setApplications(sortApplications(initialApplications));
  }, [initialApplications]);

  useEffect(() => {
    if (applicationIds.length === 0) {
      setInterviewMap({});
      return;
    }

    const supabase = createClient();
    supabase
      .from("interview_schedules")
      .select("id, application_id, status, scheduled_at, duration_minutes, meeting_type, meeting_link, proposed_slots, selected_slot, office_branches(name, address)")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false })
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) return;
        const map: Record<string, InterviewScheduleItem> = {};
        for (const row of data as any[]) {
          if (!map[row.application_id]) {
            map[row.application_id] = row;
          }
        }
        setInterviewMap(map);
      });
  }, [applicationIds, interviewRefreshTick]);

  useEffect(() => {
    if (selectedApplicationId && !selectedApplication) {
      setSelectedApplicationId(null);
    }
  }, [selectedApplication, selectedApplicationId]);

  useEffect(() => {
    if (tenantJobIds.length === 0) {
      return;
    }

    let isMounted = true;
    const supabase = createClient();
    const applicationFilter = `job_id=in.(${tenantJobIds.join(",")})`;

    const channel = supabase
      .channel(`application-hub-${currentCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
          filter: applicationFilter,
        },
        async (payload: any) => {
          if (!isMounted) {
            return;
          }

          const eventType = payload?.eventType as string | undefined;

          if (eventType === "DELETE") {
            const deletedId = normalizeText(payload?.old?.id);
            if (!deletedId) {
              return;
            }

            setApplications((prev) => prev.filter((application) => application.id !== deletedId));
            return;
          }

          const changedId = normalizeText(payload?.new?.id);
          if (!changedId) {
            return;
          }

          if (eventType === "INSERT") {
            const { data: inserted } = await supabase
              .from("job_applications")
              .select(`
                id,
                job_id,
                applicant_id,
                resume_id,
                status,
                cover_letter,
                match_score,
                hr_notes,
                created_at,
                updated_at,
                candidate:profiles ( id, first_name, last_name, email, phone, avatar_url, city, country ),
                job:job_postings ( id, title, location, tenant_id )
              `)
              .eq("id", changedId)
              .maybeSingle();

            const raw = inserted as any;
            const insertedRow: ApplicationHubCard | null = raw ? {
              ...raw,
              submitted_at: raw.created_at ?? new Date().toISOString(),
            } : null;

            if (!isMounted || !insertedRow) {
              return;
            }

            toast.info("🎉 New Application Received!", {
              description: "A candidate just applied to an open position.",
            });

            setApplications((prev) => mergeRealtimeApplication(prev, insertedRow));
            router.refresh();
            return;
          }

          setApplications((prev) => {
            const existingIndex = prev.findIndex((application) => application.id === changedId);
            if (existingIndex === -1) {
              return prev;
            }

            const next = [...prev];
            next[existingIndex] = {
              ...next[existingIndex],
              status: typeof payload?.new?.status === "string" ? payload.new.status : next[existingIndex].status,
              match_score:
                typeof payload?.new?.match_score === "number"
                  ? payload.new.match_score
                  : next[existingIndex].match_score,
              cover_letter:
                typeof payload?.new?.cover_letter === "string"
                  ? payload.new.cover_letter
                  : next[existingIndex].cover_letter,
              hr_notes:
                typeof payload?.new?.hr_notes === "string"
                  ? payload.new.hr_notes
                  : payload?.new?.hr_notes === null
                    ? null
                    : next[existingIndex].hr_notes,
              updated_at:
                typeof payload?.new?.updated_at === "string"
                  ? payload.new.updated_at
                  : next[existingIndex].updated_at,
            };

            return sortApplications(next);
          });
        }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR") {
          console.error(`application-hub-${currentCompanyId} channel error: subscription failed`);
        }

        if (status === "TIMED_OUT") {
          console.warn(`application-hub-${currentCompanyId} channel timed out, retrying...`);
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [currentCompanyId, router, tenantJobIds]);

  const updateApplicationStatus = async (
    applicationId: string,
    nextStatus: string,
    options?: { keepDrawerOpen?: boolean; closeDrawer?: boolean },
  ) => {
    if (!tenantJobIds.length) {
      return;
    }

    const previousState = applications;
    const nextTimestamp = new Date().toISOString();

    setIsSavingId(applicationId);
    setApplications((prev) =>
      sortApplications(
        prev.map((application) =>
          application.id === applicationId
            ? {
                ...application,
                status: nextStatus,
                updated_at: nextTimestamp,
              }
            : application,
        ),
      ),
    );

    const formData = new FormData();
    formData.set("application_id", applicationId);
    formData.set("status", nextStatus);

    try {
      await updateApplicationStatusAction(formData);
    } catch (error) {
      console.error("Failed to update application status:", error);
      toast.error("Failed to update candidate stage.");
      setApplications(previousState);
      setIsSavingId(null);
      return;
    }

    setIsSavingId(null);

    if (options?.closeDrawer) {
      setSelectedApplicationId(null);
    }

    if (options?.keepDrawerOpen) {
      setSelectedApplicationId(applicationId);
    }
  };

  const handleSelectApplication = (applicationId: string) => {
    setSelectedApplicationId(applicationId);
  };

  const handlePrimaryAction = async (application: ApplicationHubCard) => {
    const stageKey = getStageForStatus(application.status);

    if (stageKey === "new") {
      const nextStatus = getNextDbStatus(stageKey);
      if (nextStatus) {
        await updateApplicationStatus(application.id, nextStatus, { keepDrawerOpen: true });
      }

      return;
    }

    if (stageKey === "offer") {
      router.push(`/job-offer/${encodeURIComponent(application.id)}`);
      return;
    }

    if (stageKey === "screening" || stageKey === "closed" || stageKey === "other") {
      setSelectedApplicationId(application.id);
    }
  };

  const handleScheduleInterview = (application: ApplicationHubCard) => {
    router.push(`/hr/interviews/schedule?applicationId=${encodeURIComponent(application.id)}`);
  };

  const handleRejectApplication = async (applicationId: string) => {
    await updateApplicationStatus(applicationId, "rejected", { closeDrawer: true });
  };

  const handleAdvanceApplication = async (applicationId: string) => {
    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      return;
    }

    const stageKey = getStageForStatus(application.status);
    const nextStatus = getNextDbStatus(stageKey);

    if (!nextStatus) {
      return;
    }

    await updateApplicationStatus(applicationId, nextStatus);
  };

  const handleOpenFullApplication = (applicationId: string) => {
    router.push(`/hr/applicants/${encodeURIComponent(applicationId)}`);
  };

  // Closed bucket = rejected + withdrawn + other
  const closedApplications = [
    ...stageColumns.closed,
    ...stageColumns.other,
  ];

  return (
    <div className="relative flex h-full w-full flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="flex h-full w-full flex-1 min-h-0 flex-col gap-4">
        {/* Active pipeline columns */}
        <div className="flex-1 w-full h-full min-h-0 overflow-x-auto overflow-y-hidden pb-2 modern-scrollbar">
          <div className="inline-flex min-w-full h-full gap-4 p-4 bg-surface-bg border border-border rounded-xl">
            {ACTIVE_STAGES.map((stage) => (
              <PipelineColumn
                key={stage.key}
                stage={stage}
                applications={stageColumns[stage.key]}
                interviewMap={interviewMap}
                onSelect={handleSelectApplication}
                onPrimaryAction={handlePrimaryAction}
                onSchedule={handleScheduleInterview}
              />
            ))}
          </div>
        </div>

        {/* Collapsed "Closed" section for rejected + withdrawn */}
        <ClosedSection
          applications={closedApplications}
          onSelect={handleSelectApplication}
        />
      </div>

      <ApplicationDrawer
        application={selectedApplication}
        interview={selectedApplication ? interviewMap[selectedApplication.id] : null}
        isOpen={Boolean(selectedApplication)}
        onClose={() => setSelectedApplicationId(null)}
        onReject={handleRejectApplication}
        onAdvance={handleAdvanceApplication}
        onOpenFullApplication={handleOpenFullApplication}
        onSchedule={handleScheduleInterview}
        onViewEmployee={() => router.push("/hr/employees")}
        onInterviewUpdated={() => {
          setInterviewRefreshTick((t) => t + 1);
          router.refresh();
        }}
      />

      {isSavingId ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] rounded-full bg-navbar px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          Saving changes...
        </div>
      ) : null}
    </div>
  );
}
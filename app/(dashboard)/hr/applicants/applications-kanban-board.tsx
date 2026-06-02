"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

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

export type PipelineStageKey = "new" | "screening" | "interview" | "offer" | "rejected";

export type ApplicationHubCard = {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  resume_id: string;
  status: string;
  cover_letter: string | null;
  match_score: number | null;
  hr_notes: string | null;
  submitted_at: string;
  updated_at: string;
  profiles: CandidateProfile | CandidateProfile[] | null;
  job_postings: JobPostingSummary | JobPostingSummary[] | null;
};

type ApplicationsKanbanBoardProps = {
  applications: ApplicationHubCard[];
  currentCompanyId: string;
  tenantJobIds: string[];
};

type StageConfig = {
  key: PipelineStageKey;
  label: string;
  description: string;
  tintClassName: string;
  badgeClassName: string;
};

const PIPELINE_STAGES: StageConfig[] = [
  {
    key: "new",
    label: "New",
    description: "Fresh applications",
    tintClassName: "",
    badgeClassName: "bg-[#dbeafe] text-[#1d4ed8]",
  },
  {
    key: "screening",
    label: "Screening",
    description: "Assessment in progress",
    tintClassName: "",
    badgeClassName: "bg-[#fef3c7] text-[#92400e]",
  },
  {
    key: "interview",
    label: "Interview",
    description: "Interview coordination",
    tintClassName: "",
    badgeClassName: "bg-[#ede9fe] text-[#5b21b6]",
  },
  {
    key: "offer",
    label: "Offer",
    description: "Offer and negotiation",
    tintClassName: "",
    badgeClassName: "bg-[#d1fae5] text-[#065f46]",
  },
  {
    key: "rejected",
    label: "Rejected",
    description: "Closed candidates",
    tintClassName: "",
    badgeClassName: "bg-[#fee2e2] text-[#991b1b]",
  },
];

const ACTIVE_STAGE_SEQUENCE: PipelineStageKey[] = ["new", "screening", "interview", "offer"];

const NEXT_STATUS_BY_STAGE: Record<Exclude<PipelineStageKey, "rejected">, string | null> = {
  new: "under_review",
  screening: "interview_scheduled",
  interview: "offer_sent",
  offer: null,
};

const STAGE_BY_STATUS: Record<string, PipelineStageKey> = {
  draft: "new",
  submitted: "new",
  under_review: "screening",
  shortlisted: "screening",
  interview_scheduled: "interview",
  interviewed: "interview",
  negotiating: "offer",
  offer_sent: "offer",
  offer_accepted: "offer",
  offer_declined: "offer",
  offer_expired: "offer",
  pre_employment: "offer",
  hired: "offer",
  hire_confirmed: "offer",
  rejected: "rejected",
  withdrawn: "rejected",
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getApplicantName(profile: CandidateProfile | null): string {
  if (!profile) {
    return "Unknown Candidate";
  }

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

function getStageKeyFromStatus(status: string): PipelineStageKey {
  return STAGE_BY_STATUS[String(status).toLowerCase()] ?? "new";
}

function getNextStatus(stageKey: PipelineStageKey): string | null {
  return stageKey === "rejected" ? null : NEXT_STATUS_BY_STAGE[stageKey];
}

function getStageProgress(stageKey: PipelineStageKey): number {
  const activeIndex = ACTIVE_STAGE_SEQUENCE.indexOf(stageKey as (typeof ACTIVE_STAGE_SEQUENCE)[number]);
  if (activeIndex < 0) {
    return 0;
  }

  return Math.round(((activeIndex + 1) / ACTIVE_STAGE_SEQUENCE.length) * 100);
}

function getScoreClasses(score: number | null): string {
  if (score === null) {
    return "bg-gray-100 text-gray-500";
  }

  if (score >= 75) {
    return "bg-green-50 text-green-700";
  }

  if (score >= 50) {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-red-50 text-red-700";
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

function groupApplicationsByStage(items: ApplicationHubCard[]): Record<PipelineStageKey, ApplicationHubCard[]> {
  const grouped: Record<PipelineStageKey, ApplicationHubCard[]> = {
    new: [],
    screening: [],
    interview: [],
    offer: [],
    rejected: [],
  };

  for (const item of items) {
    grouped[getStageKeyFromStatus(item.status)].push(item);
  }

  return {
    new: sortApplications(grouped.new),
    screening: sortApplications(grouped.screening),
    interview: sortApplications(grouped.interview),
    offer: sortApplications(grouped.offer),
    rejected: sortApplications(grouped.rejected),
  };
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
  const profile = normalizeRelation(application.profiles);
  const jobPosting = normalizeRelation(application.job_postings);
  return profile?.city?.trim() || jobPosting?.location?.trim() || "Remote";
}

function getRoleTitle(application: ApplicationHubCard): string {
  const jobPosting = normalizeRelation(application.job_postings);
  return jobPosting?.title?.trim() || "Untitled role";
}

function getStageLabel(stageKey: PipelineStageKey): string {
  return PIPELINE_STAGES.find((stage) => stage.key === stageKey)?.label ?? "New";
}

function getPrimaryActionLabel(stageKey: PipelineStageKey): string {
  switch (stageKey) {
    case "new":
      return "Screen Candidate";
    case "screening":
      return "View Assessment";
    case "interview":
      return "Schedule Room/Interview";
    case "offer":
      return "Send Offer";
    case "rejected":
      return "Review Candidate";
    default:
      return "View Candidate";
  }
}

function ApplicationCard({
  application,
  onSelect,
  onPrimaryAction,
  onSchedule,
}: {
  application: ApplicationHubCard;
  onSelect: (applicationId: string) => void;
  onPrimaryAction: (application: ApplicationHubCard) => void;
  onSchedule: (application: ApplicationHubCard) => void;
}) {
  const profile = normalizeRelation(application.profiles);
  const stageKey = getStageKeyFromStatus(application.status);
  const actionLabel = getPrimaryActionLabel(stageKey);
  const score = application.match_score !== null ? Math.round(Number(application.match_score)) : null;

  return (
    <article
      className="hairline-border cursor-pointer rounded-xl bg-white p-5 transition-all duration-200 hover:border-primary hover:shadow-sm"
      onClick={() => onSelect(application.id)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {profile?.avatar_url ? (
            <img
              alt={getApplicantName(profile)}
              src={profile.avatar_url}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {getApplicantInitials(profile)}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-on-surface">{getApplicantName(profile)}</p>
            <p className="text-[11px] uppercase tracking-[0.06em] text-outline">
              Applied {formatApplicationTime(application.submitted_at)}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getScoreClasses(score)}`}>
          {score !== null ? `${score}% match` : "Calculating..."}
        </span>
      </div>

      <div className="mb-4 space-y-1">
        <p className="truncate text-[13px] font-medium text-on-surface">{getRoleTitle(application)}</p>
        <p className="text-[13px] text-secondary">{getCandidateLocation(application)}</p>
      </div>

      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-outline">
        <span>{getStageLabel(stageKey)}</span>
        <span>{normalizeRelation(application.job_postings)?.tenant_id ? "Tenant scoped" : "Active pipeline"}</span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();

          if (stageKey === "interview") {
            onSchedule(application);
            return;
          }

          onPrimaryAction(application);
        }}
        className={`w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${
          stageKey === "new"
            ? "bg-[#F0EDFD] text-[#4A4880] hover:bg-[#e1dbfb]"
            : stageKey === "screening"
              ? "bg-[#F0EDFD] text-[#4A4880] hover:bg-[#e1dbfb]"
              : stageKey === "interview"
                ? "bg-primary text-white hover:bg-primary-dark"
                : stageKey === "offer"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-rose-100 text-rose-700 hover:bg-rose-200"
        }`}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function PipelineColumn({
  stage,
  applications,
  onSelect,
  onPrimaryAction,
  onSchedule,
}: {
  stage: StageConfig;
  applications: ApplicationHubCard[];
  onSelect: (applicationId: string) => void;
  onPrimaryAction: (application: ApplicationHubCard) => void;
  onSchedule: (application: ApplicationHubCard) => void;
}) {
  return (
    <section className={`kanban-col flex h-full min-h-0 flex-col rounded-xl border border-card-border/40 p-4 min-w-[320px] max-w-[320px] flex-shrink-0 ${stage.tintClassName}`}>
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-medium text-on-surface">{stage.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stage.badgeClassName}`}>
            {applications.length}
          </span>
        </div>

        {/* Removed non-functional more_horiz button */}
      </div>

      <p className="mb-4 px-1 text-[12px] text-secondary">{stage.description}</p>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 modern-scrollbar">
        {applications.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-card-border bg-white/60 px-4 text-center text-[13px] text-secondary">
            No candidates yet
          </div>
        ) : (
          applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
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

function ApplicationDrawer({
  application,
  isOpen,
  onClose,
  onReject,
  onAdvance,
  onOpenFullApplication,
}: {
  application: ApplicationHubCard | null;
  isOpen: boolean;
  onClose: () => void;
  onReject: (applicationId: string) => void;
  onAdvance: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
}) {
  const profile = normalizeRelation(application?.profiles);
  const jobPosting = normalizeRelation(application?.job_postings);
  const stageKey = application ? getStageKeyFromStatus(application.status) : "new";
  const nextStatus = getNextStatus(stageKey);
  const matchScore = application?.match_score !== null && application?.match_score !== undefined
    ? Math.round(Number(application.match_score))
    : null;
  const stageProgress = getStageProgress(stageKey);

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
          {/* Removed non-functional share/more_vert buttons */}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar">
        {application ? (
          <div className="space-y-8">
            <section className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                {profile?.avatar_url ? (
                  <img
                    alt={getApplicantName(profile)}
                    src={profile.avatar_url}
                    className="h-24 w-24 rounded-full border-4 border-surface object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-surface bg-primary/10 text-2xl font-bold text-primary">
                    {getApplicantInitials(profile)}
                  </div>
                )}

                <div className="absolute -bottom-2 right-0 rounded-full border-2 border-white bg-[#E1F5EE] px-3 py-1 text-[12px] font-bold text-[#0F6E56]">
                  {matchScore !== null ? `${matchScore}% Match` : "No Match Score"}
                </div>
              </div>

              <h2 className="text-[22px] font-semibold text-on-surface">{getApplicantName(profile)}</h2>
              <p className="text-[14px] text-secondary">
                {getRoleTitle(application)} • {getCandidateLocation(application)}
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="rounded-full bg-surface-container-low px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
                  {getStageLabel(stageKey)}
                </span>
                <span className="rounded-full bg-surface-container-low px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
                  Applied {formatApplicationTime(application.submitted_at)}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-card-border bg-surface p-4">
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
                Match Breakdown
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-on-surface">Match Score</span>
                    <span className="font-semibold">{matchScore !== null ? `${matchScore}%` : "N/A"}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E0D9FC]">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${matchScore ?? 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-on-surface">Pipeline Progress</span>
                    <span className="font-semibold">{stageProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E0D9FC]">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${stageProgress}%` }} />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-card-border/70 bg-white p-4">
                <p className="mb-1 text-[11px] uppercase tracking-[0.06em] text-outline">Role Title</p>
                <p className="text-[14px] font-semibold text-on-surface">{getRoleTitle(application)}</p>
              </div>
              <div className="rounded-lg border border-card-border/70 bg-white p-4">
                <p className="mb-1 text-[11px] uppercase tracking-[0.06em] text-outline">Location</p>
                <p className="text-[14px] font-semibold text-on-surface">{getCandidateLocation(application)}</p>
              </div>
              <div className="rounded-lg border border-card-border/70 bg-white p-4">
                <p className="mb-1 text-[11px] uppercase tracking-[0.06em] text-outline">Application Time</p>
                <p className="text-[14px] font-semibold text-on-surface">{formatApplicationTime(application.submitted_at)}</p>
              </div>
              <div className="rounded-lg border border-card-border/70 bg-white p-4">
                <p className="mb-1 text-[11px] uppercase tracking-[0.06em] text-outline">Tenant Scope</p>
                <p className="text-[14px] font-semibold text-on-surface">{jobPosting?.tenant_id ? "Locked" : "Inherited"}</p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
                Resume Preview
              </h3>
              <div className="flex aspect-[1/1.2] flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-[#F8F6FF] p-8 text-center">
                <span className="material-symbols-outlined mb-3 text-[48px] text-primary">description</span>
                <p className="mb-4 text-[14px] text-primary-dark">
                  {profile?.first_name || profile?.last_name ? `${getApplicantName(profile)} Resume` : "Application File"}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenFullApplication(application.id)}
                  className="rounded-lg border border-card-border bg-white px-5 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-surface"
                >
                  Open Full Application
                </button>
              </div>
            </section>

            {application.cover_letter ? (
              <section className="rounded-xl border border-card-border bg-surface p-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
                  Cover Letter
                </h3>
                <p className="whitespace-pre-wrap text-[14px] leading-6 text-secondary">{application.cover_letter}</p>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-card-border bg-surface p-6 text-center text-[14px] text-secondary">
            Select a candidate to inspect their application details.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-card-border p-6">
        <button
          type="button"
          onClick={() => {
            if (!application) {
              return;
            }

            onReject(application.id);
          }}
          className="rounded-lg border border-[#BA1A1A] px-4 py-3 text-[13px] font-semibold text-[#BA1A1A] transition-colors hover:bg-error-container"
        >
          Reject
        </button>

        <button
          type="button"
          disabled={!application || !nextStatus}
          onClick={() => {
            if (!application || !nextStatus) {
              return;
            }

            onAdvance(application.id);
          }}
          className="rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Move to Next Stage
        </button>
      </div>
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

  useEffect(() => {
    setApplications(sortApplications(initialApplications));
  }, [initialApplications]);

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
    const applicationFilter = `job_posting_id=in.(${tenantJobIds.join(",")})`;

    const channel = supabase
      .channel(`application-hub-${currentCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
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
            const { data: inserted } = (await supabase
              .from("applications")
              .select(`
                id,
                job_posting_id,
                candidate_id,
                resume_id,
                status,
                cover_letter,
                match_score,
                hr_notes,
                submitted_at,
                updated_at,
                profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone, avatar_url, city, country ),
                job_postings!inner ( id, title, location, tenant_id )
              `)
              .eq("id", changedId)
              .eq("job_postings.tenant_id", currentCompanyId)
              .maybeSingle()) as { data: ApplicationHubCard | null; error: any };

            if (!isMounted || !inserted) {
              return;
            }

            setApplications((prev) => mergeRealtimeApplication(prev, inserted));
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
              submitted_at:
                typeof payload?.new?.submitted_at === "string"
                  ? payload.new.submitted_at
                  : next[existingIndex].submitted_at,
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
  }, [currentCompanyId, tenantJobIds]);

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

    const supabase = createClient();
    const { error } = await supabase
      .from("applications")
      .update({
        status: nextStatus,
        updated_at: nextTimestamp,
      })
      .eq("id", applicationId)
      .in("job_posting_id", tenantJobIds);

    setIsSavingId(null);

    if (error) {
      console.error("Failed to update application status:", error.message);
      setApplications(previousState);
      return;
    }

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
    const stageKey = getStageKeyFromStatus(application.status);

    if (stageKey === "new") {
      const nextStatus = getNextStatus(stageKey);
      if (nextStatus) {
        await updateApplicationStatus(application.id, nextStatus, { keepDrawerOpen: true });
      }

      return;
    }

    if (stageKey === "offer") {
      router.push(`/job-offer/${encodeURIComponent(application.id)}`);
      return;
    }

    if (stageKey === "screening" || stageKey === "rejected") {
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

    const stageKey = getStageKeyFromStatus(application.status);
    const nextStatus = getNextStatus(stageKey);

    if (!nextStatus) {
      return;
    }

    await updateApplicationStatus(applicationId, nextStatus);
  };

  const handleOpenFullApplication = (applicationId: string) => {
    router.push(`/hr/applicants/${encodeURIComponent(applicationId)}`);
  };

  const hasSelectedApplication = Boolean(selectedApplication);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className={`flex min-h-0 flex-1 flex-col gap-5 pr-0 ${hasSelectedApplication ? "xl:pr-[440px]" : ""}`}>
        <div className="flex-1 min-h-0 overflow-x-auto pb-2 modern-scrollbar">
          <div className="flex flex-row h-full min-h-0 gap-4 p-5 px-6 bg-[#f4f5f7] overflow-x-auto overflow-y-hidden pb-4">
            {PIPELINE_STAGES.map((stage) => (
              <PipelineColumn
                key={stage.key}
                stage={stage}
                applications={stageColumns[stage.key]}
                onSelect={handleSelectApplication}
                onPrimaryAction={handlePrimaryAction}
                onSchedule={handleScheduleInterview}
              />
            ))}
          </div>
        </div>
      </div>

      <ApplicationDrawer
        application={selectedApplication}
        isOpen={Boolean(selectedApplication)}
        onClose={() => setSelectedApplicationId(null)}
        onReject={handleRejectApplication}
        onAdvance={handleAdvanceApplication}
        onOpenFullApplication={handleOpenFullApplication}
      />

      {isSavingId ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] rounded-full bg-navbar px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          Saving changes...
        </div>
      ) : null}
    </div>
  );
}
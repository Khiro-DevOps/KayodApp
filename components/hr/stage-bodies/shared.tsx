"use client";

import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import { UI_STAGES, type UiStageKey } from "@/lib/application-stages";

export type CandidateProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
};

export type JobPostingSummary = {
  id: string;
  title: string;
  location: string | null;
  tenant_id?: string | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export function resolveProfile(application: ApplicationHubCard | null | undefined): CandidateProfile | null {
  if (!application) return null;
  return (
    normalizeRelation(application.candidate) ??
    normalizeRelation(application.profiles) ??
    null
  );
}

export function resolveJob(application: ApplicationHubCard | null | undefined): JobPostingSummary | null {
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

export function getApplicantName(profile: CandidateProfile | null): string {
  if (!profile) {
    return "Unknown Candidate";
  }

  const fullNameField = normalizeText((profile as unknown as { full_name?: unknown }).full_name);
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

export function getApplicantInitials(profile: CandidateProfile | null): string {
  const name = getApplicantName(profile);
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A";
}

export function getCandidateLocation(application: ApplicationHubCard): string {
  const profile = resolveProfile(application);
  const jobPosting = resolveJob(application);
  return profile?.city?.trim() || jobPosting?.location?.trim() || "Remote";
}

export function getRoleTitle(application: ApplicationHubCard): string {
  const jobPosting = resolveJob(application);
  return jobPosting?.title?.trim() || "Untitled role";
}

export function getStageLabel(stageKey: UiStageKey): string {
  return UI_STAGES.find((stage) => stage.key === stageKey)?.label ?? "New";
}

export function formatApplicationTime(value: string): string {
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

export function formatMatchScore(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  const normalised = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return String(normalised);
}

export function getScoreClasses(score: string | null): string {
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

export function getStageProgress(stageKey: UiStageKey): number {
  const order: UiStageKey[] = ["new", "screening", "interview", "offer", "hired"];
  const idx = order.indexOf(stageKey);
  if (idx < 0) return 100;
  return Math.round(((idx + 1) / order.length) * 100);
}

export function CandidateHeaderSection({
  application,
  stageKey,
  scoreDisplay,
}: {
  application: ApplicationHubCard;
  stageKey: UiStageKey;
  scoreDisplay?: string | null;
}) {
  const profile = resolveProfile(application);
  const resolvedScore = scoreDisplay !== undefined ? scoreDisplay : formatMatchScore(application.match_score);

  return (
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

        <div className={`absolute -bottom-2 right-0 rounded-full border-2 border-card-bg px-3 py-1 text-[12px] font-bold ${getScoreClasses(resolvedScore)}`}>
          {resolvedScore !== null ? `${resolvedScore}% Match` : "—"}
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
  );
}

export function MatchBreakdownSection({
  application,
  stageKey,
  scoreDisplay,
}: {
  application: ApplicationHubCard;
  stageKey: UiStageKey;
  scoreDisplay?: string | null;
}) {
  const resolvedScore = scoreDisplay !== undefined ? scoreDisplay : formatMatchScore(application.match_score);
  const stageProgress = getStageProgress(stageKey);

  return (
    <section className="rounded-xl border border-card-border bg-surface p-4">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
        Match Breakdown
      </h3>

      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="text-on-surface">Match Score</span>
            <span className="font-semibold">
              {resolvedScore !== null ? `${resolvedScore}%` : "—"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-light">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: resolvedScore !== null ? `${resolvedScore}%` : "0%" }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="text-on-surface">Pipeline Progress</span>
            <span className="font-semibold">{stageProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-light">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${stageProgress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function MetadataGridSection({ application }: { application: ApplicationHubCard }) {
  const jobPosting = resolveJob(application);

  return (
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
        <p className="text-[14px] font-semibold text-on-surface capitalize">
          {jobPosting?.tenant_id ? "Locked" : "Inherited"} • {application.status}
        </p>
      </div>
    </section>
  );
}

export function ResumePreviewSection({
  application,
  onOpenFullApplication,
}: {
  application: ApplicationHubCard;
  onOpenFullApplication: (applicationId: string) => void;
}) {
  const profile = resolveProfile(application);

  return (
    <section>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
        Resume Preview
      </h3>
      <div className="flex aspect-[1/1.2] flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary-light p-8 text-center">
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
  );
}

export function CoverLetterSection({ application }: { application: ApplicationHubCard }) {
  if (!application.cover_letter) return null;

  return (
    <section className="rounded-xl border border-card-border bg-surface p-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
        Cover Letter
      </h3>
      <p className="whitespace-pre-wrap text-[14px] leading-6 text-secondary">{application.cover_letter}</p>
    </section>
  );
}

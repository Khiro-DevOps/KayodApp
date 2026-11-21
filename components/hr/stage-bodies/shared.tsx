"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import type { InterviewScheduleItem } from "@/components/hr/HRInterviewCardSection";
import { UI_STAGES, type UiStageKey } from "@/lib/application-stages";
import { formatPhtDate, formatPhtTime } from "@/lib/interview-date";
import { getDisplayMatchScore } from "@/lib/match-score";
import { createClient } from "@/lib/supabase/client";

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
  const { value } = getDisplayMatchScore({ applied: true, stored: score ?? null });
  return value !== null ? String(value) : null;
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

type ResumeRecord = {
  id: string;
  title: string | null;
  pdf_url: string | null;
  content_text: string | null;
  generated_content: Record<string, unknown> | null;
  input_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function getMeetingTypeLabel(meetingType?: string | null): string {
  switch (meetingType) {
    case "in_person":
      return "In-person";
    case "hybrid":
      return "Hybrid";
    case "online":
    default:
      return "Online";
  }
}

export function InterviewNotesScorecardSection({
  interview,
}: {
  interview?: InterviewScheduleItem | null;
}) {
  if (!interview) return null;

  const rating = typeof interview.scorecard?.rating === "number" ? interview.scorecard.rating : null;
  const savedNotes =
    interview.interview_notes?.trim() ||
    interview.scorecard?.private_notes?.trim() ||
    "";
  const strengths = interview.scorecard?.strengths?.trim() || "";
  const weaknesses = interview.scorecard?.weaknesses?.trim() || "";
  const dateLabel = interview.scheduled_at
    ? `${formatPhtDate(interview.scheduled_at)} • ${formatPhtTime(interview.scheduled_at)}`
    : "Pending slot selection";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          Interview Notes &amp; Scorecard
        </h3>
        {rating !== null ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700"
            aria-label={`Rating ${rating} out of 5`}
          >
            <span className="text-amber-500" aria-hidden="true">
              {"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}
              {"☆".repeat(Math.max(0, 5 - Math.round(rating)))}
            </span>
            <span>{rating}/5</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 capitalize">
          {interview.status.replace(/_/g, " ")}
        </span>
        <span>{dateLabel}</span>
        <span>•</span>
        <span>{getMeetingTypeLabel(interview.meeting_type)}</span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
        {savedNotes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{savedNotes}</p>
        ) : (
          <p className="text-sm italic text-slate-500">No interview notes recorded yet</p>
        )}

        {strengths ? (
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Strengths:</span> {strengths}
          </p>
        ) : null}
        {weaknesses ? (
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Areas to probe:</span> {weaknesses}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name?: unknown }).name ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

export function ResumePreviewSection({
  application,
}: {
  application: ApplicationHubCard;
  onOpenFullApplication?: (applicationId: string) => void;
}) {
  const profile = resolveProfile(application);
  const defaultTitle =
    profile?.first_name || profile?.last_name
      ? `${getApplicantName(profile)} Resume`
      : "Application Resume";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setIsModalOpen(false);
    setResume(null);
    setSignedPdfUrl(null);
    setLoadError(null);
  }, [application.id]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || !application.resume_id) return;

    let cancelled = false;
    const loadResume = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/hr/resume/${encodeURIComponent(application.resume_id)}`);
        const payload = (await res.json().catch(() => ({}))) as {
          resume?: ResumeRecord;
          signedPdfUrl?: string | null;
          error?: string;
        };

        if (cancelled) return;
        if (!res.ok || !payload.resume) {
          setLoadError(payload.error || "Resume record not found.");
          return;
        }

        setResume(payload.resume);
        if (payload.signedPdfUrl) {
          setSignedPdfUrl(payload.signedPdfUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load resume.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadResume();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, application.resume_id]);

  const parsedSource = resume?.generated_content ?? resume?.input_data ?? null;
  const summaryText =
    typeof parsedSource?.summary === "string"
      ? parsedSource.summary
      : typeof parsedSource?.professional_summary === "string"
        ? parsedSource.professional_summary
        : null;
  const skills = asStringArray(parsedSource?.skills);
  const experience = asRecordArray(parsedSource?.experience);
  const education = asRecordArray(parsedSource?.education);
  const updatedLabel = resume?.updated_at
    ? `Updated ${new Date(resume.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : application.resume_id
      ? `Submitted ${formatApplicationTime(application.submitted_at)}`
      : "No resume file attached";

  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        Resume
      </h3>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsModalOpen(true);
          }
        }}
        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <span className="material-symbols-outlined text-[20px]">description</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {resume?.title || defaultTitle}
            </p>
            <p className="truncate text-xs text-slate-600">{updatedLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsModalOpen(true);
          }}
          className="shrink-0 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          Preview
        </button>
      </div>

      {isModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kanban-resume-modal-title"
              onClick={() => setIsModalOpen(false)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="min-w-0">
                    <h2
                      id="kanban-resume-modal-title"
                      className="truncate text-base font-bold text-slate-900"
                    >
                      {resume?.title || defaultTitle}
                    </h2>
                    <p className="text-xs text-slate-600">{updatedLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    aria-label="Close resume preview"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {!application.resume_id ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                      No resume was attached to this application.
                    </div>
                  ) : isLoading ? (
                    <div className="flex items-center justify-center py-12 text-sm text-slate-600">
                      Loading resume preview...
                    </div>
                  ) : loadError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      {loadError}
                    </div>
                  ) : (
                    <>
                      {signedPdfUrl ? (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <iframe
                            src={signedPdfUrl}
                            title={resume?.title || defaultTitle}
                            className="h-[55vh] w-full"
                          />
                        </div>
                      ) : null}

                      {summaryText ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Summary
                          </h4>
                          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                            {summaryText}
                          </p>
                        </div>
                      ) : null}

                      {skills.length > 0 ? (
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Skills
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {skills.map((skill, idx) => (
                              <span
                                key={`${skill}-${idx}`}
                                className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {experience.length > 0 ? (
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Experience
                          </h4>
                          <div className="space-y-2">
                            {experience.map((exp, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-slate-200 bg-white p-3.5"
                              >
                                <p className="text-sm font-semibold text-slate-900">
                                  {String(exp.title ?? exp.role ?? "Role")}
                                  {exp.company ? ` — ${String(exp.company)}` : ""}
                                </p>
                                {exp.duration || exp.dates || exp.period ? (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {String(exp.duration ?? exp.dates ?? exp.period)}
                                  </p>
                                ) : null}
                                {exp.description ? (
                                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                                    {String(exp.description)}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {education.length > 0 ? (
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Education
                          </h4>
                          <div className="space-y-2">
                            {education.map((edu, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-slate-200 bg-white p-3.5"
                              >
                                <p className="text-sm font-semibold text-slate-900">
                                  {String(edu.degree ?? edu.program ?? "Degree")}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">
                                  {String(edu.school ?? edu.institution ?? "")}
                                  {edu.year || edu.dates ? ` • ${String(edu.year ?? edu.dates)}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {!signedPdfUrl &&
                      !summaryText &&
                      skills.length === 0 &&
                      experience.length === 0 &&
                      education.length === 0 ? (
                        resume?.content_text ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Resume Text
                            </h4>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                              {resume.content_text}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                            No parsed resume content available.
                          </div>
                        )
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
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

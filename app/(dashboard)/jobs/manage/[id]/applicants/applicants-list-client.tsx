"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import ApplicantDetailDrawer from "./applicant-detail-drawer";
import HireConfirmBottomSheet from "@/components/hr/HireConfirmBottomSheet";
import { createClient } from "@/lib/supabase/client";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { ApplicationStatus, Interview } from "@/lib/types";

interface CandidateProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
}

interface ResumeRow {
  id: string;
  title: string | null;
  pdf_url: string | null;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  match_score: number | null;
  submitted_at: string;
  cover_letter: string | null;
  hr_notes?: string | null;
  resume_id: string | null;
  profiles: CandidateProfile | null;
  resumes: ResumeRow | ResumeRow[] | null;
}

interface JobOfferRow {
  id: string;
  application_id: string;
  status: string;
  salary: number | null;
  start_date: string | null;
  work_setup: string | null;
  department: string | null;
  latest_docuseal_url: string | null;
  job_metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

interface SignedDocumentRow {
  id: string;
  application_id: string;
  status: string;
  docuseal_submitter_id: string | null;
  docuseal_submission_url: string | null;
  latest_docuseal_url: string | null;
  pdf_file_path: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

interface StageDefinition {
  key: string;
  label: string;
  statuses: ApplicationStatus[];
  color: string;
}

const STAGES: StageDefinition[] = [
  { key: "new", label: "New", statuses: ["submitted", "draft"], color: "#3b82f6" },
  { key: "screening", label: "Screening", statuses: ["under_review", "shortlisted"], color: "#eab308" },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled", "interviewed"], color: "#a855f7" },
  { key: "offer", label: "Offer", statuses: ["negotiating", "offer_sent"], color: "#f97316" },
  { key: "hired", label: "Hired", statuses: ["hired", "hire_confirmed"], color: "#16a34a" },
];

const CLOSED_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn"];
const SIGNED_STATUSES = new Set(["SIGNED", "HIRED", "ACCEPTED", "HIRE_CONFIRMED"]);

type QuickAction = {
  label: string;
  action: "screen" | "interview" | "view_interview" | "send_offer" | "view_offer" | "confirm_hire" | null;
  color: string;
};

interface ApplicantsHubClientProps {
  jobId: string;
  jobTitle: string;
  applications: ApplicationRow[];
  interviews: Map<string, Interview>;
  jobOffers: Record<string, JobOfferRow>;
  signedDocuments: Record<string, SignedDocumentRow>;
}

interface ConfirmSheetAppState {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  isAlreadyConfirmed: boolean;
  offerMetadata: {
    startDate: string | null;
    workSetup: string | null;
    salaryAmount: number | null;
    salaryCurrency: string;
    signedPdfUrl: string | null;
  };
  signedAt: string | null;
  submittedAt: string | null;
}

function getQuickAction(app: ApplicationRow, hasSignedContract: boolean): QuickAction | null {
  if (hasSignedContract && app.status !== "hire_confirmed") {
    return { label: "Confirm hire ✓", action: "confirm_hire", color: "#16a34a" };
  }

  switch (app.status) {
    case "submitted":
    case "draft":
      return { label: "Move to screening", action: "screen", color: "#eab308" };
    case "under_review":
    case "shortlisted":
      return { label: "Schedule interview", action: "interview", color: "#a855f7" };
    case "interview_scheduled":
      return { label: "View interview", action: "view_interview", color: "#a855f7" };
    case "interviewed":
    case "negotiating":
      return { label: "Send offer", action: "send_offer", color: "#f97316" };
    case "offer_sent":
      return { label: "View offer", action: "view_offer", color: "#f97316" };
    case "hired":
      return { label: "Confirm hire ✓", action: "confirm_hire", color: "#16a34a" };
    case "hire_confirmed":
      return { label: "Hired ✓", action: null, color: "#16a34a" };
    default:
      return null;
  }
}

function getJobOfferBadge(jobOffer?: JobOfferRow) {
  if (!jobOffer) return null;

  const normalizedStatus = String(jobOffer.status ?? "").trim().toUpperCase();
  const isSigned = SIGNED_STATUSES.has(normalizedStatus);
  return {
    label: isSigned ? "✓ Signed — confirm hire" : "⏳ Awaiting signature",
    color: isSigned ? "#16a34a" : "#f97316",
    updatedAt: jobOffer.updated_at,
    isSigned,
  };
}

function getApplicantName(candidate: CandidateProfile | null) {
  if (!candidate) return "Unknown";
  return `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || "Unknown";
}

function getResumeTitle(resumes: ResumeRow | ResumeRow[] | null) {
  const resume = Array.isArray(resumes) ? resumes[0] : resumes;
  return resume?.title ?? "Resume";
}

export default function ApplicantsHubClient({
  jobId,
  jobTitle,
  applications,
  interviews,
  jobOffers: initialJobOffers,
  signedDocuments: initialSignedDocuments,
}: ApplicantsHubClientProps) {
  const router = useRouter();
  const [applicationRows, setApplicationRows] = useState<ApplicationRow[]>(applications);
  const [interviewMap, setInterviewMap] = useState<Map<string, Interview>>(interviews);
  const [jobOffers, setJobOffers] = useState<Record<string, JobOfferRow>>(initialJobOffers);
  const [signedDocuments, setSignedDocuments] = useState<Record<string, SignedDocumentRow>>(initialSignedDocuments);
  const [activeStage, setActiveStage] = useState(() => {
    const hasSignedPendingConfirmation = applications.some((app) => {
      const offer = initialJobOffers[app.id];
      return SIGNED_STATUSES.has(String(offer?.status ?? "").trim().toUpperCase()) && app.status !== "hire_confirmed";
    });

    return hasSignedPendingConfirmation ? "hired" : "new";
  });
  const [showClosed, setShowClosed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<string | null>(null);
  const [confirmSheetApp, setConfirmSheetApp] = useState<ConfirmSheetAppState | null>(null);
  const applicationIdsRef = useRef<Set<string>>(new Set(applications.map((app) => app.id)));

  useEffect(() => {
    setApplicationRows(applications);
  }, [applications]);

  useEffect(() => {
    setInterviewMap(interviews);
  }, [interviews]);

  useEffect(() => {
    setJobOffers(initialJobOffers);
  }, [initialJobOffers]);

  useEffect(() => {
    setSignedDocuments(initialSignedDocuments);
  }, [initialSignedDocuments]);

  useEffect(() => {
    applicationIdsRef.current = new Set(applicationRows.map((app) => app.id));
  }, [applicationRows]);

  useEffect(() => {
    if (!selectedApplication) return;
    const refreshed = applicationRows.find((app) => app.id === selectedApplication.id);
    if (refreshed) {
      setSelectedApplication(refreshed);
    }
  }, [applicationRows, selectedApplication]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`job-applicants-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `job_posting_id=eq.${jobId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String((payload.old as { id?: string } | null)?.id ?? "");
            if (!deletedId) return;

            setApplicationRows((prev) => prev.filter((app) => app.id !== deletedId));
            return;
          }

          const changed = payload.new as Partial<ApplicationRow> | null;
          if (!changed?.id) return;

          setApplicationRows((prev) => {
            const index = prev.findIndex((app) => app.id === changed.id);
            if (index === -1) return prev;

            const next = [...prev];
            next[index] = { ...next[index], ...changed };
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interviews",
          filter: `application_id=in.(${Array.from(applicationIdsRef.current).join(",")})`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { application_id?: string } | null;
            if (!deleted?.application_id) return;
            if (!applicationIdsRef.current.has(deleted.application_id)) return;

            setInterviewMap((prev) => {
              const next = new Map(prev);
              next.delete(deleted.application_id as string);
              return next;
            });
            return;
          }

          const changed = payload.new as Interview | null;
          if (!changed?.application_id) return;
          if (!applicationIdsRef.current.has(changed.application_id)) return;

          setInterviewMap((prev) => {
            const next = new Map(prev);
            next.set(changed.application_id, changed);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_offers",
          filter: `application_id=in.(${Array.from(applicationIdsRef.current).join(",")})`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { application_id?: string } | null;
            if (!deleted?.application_id) return;

            setJobOffers((prev) => {
              if (!prev[deleted.application_id]) return prev;
              const next = { ...prev };
              delete next[deleted.application_id];
              return next;
            });
            return;
          }

          const changed = payload.new as JobOfferRow | null;
          if (!changed?.application_id) return;

          setJobOffers((prev) => ({
            ...prev,
            [changed.application_id]: changed,
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signed_documents",
          filter: `application_id=in.(${Array.from(applicationIdsRef.current).join(",")})`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { application_id?: string } | null;
            if (!deleted?.application_id) return;

            setSignedDocuments((prev) => {
              if (!prev[deleted.application_id]) return prev;
              const next = { ...prev };
              delete next[deleted.application_id];
              return next;
            });
            return;
          }

          const changed = payload.new as SignedDocumentRow | null;
          if (!changed?.application_id) return;

          setSignedDocuments((prev) => ({
            ...prev,
            [changed.application_id]: changed,
          }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  const stageCounts = STAGES.reduce((accumulator, stage) => {
    if (stage.key === "hired") {
      const hiredByStatus = applicationRows.filter((applicationRow) => stage.statuses.includes(applicationRow.status)).length;
      const signedNotConfirmed = applicationRows.filter((applicationRow) => {
        if (["hired", "hire_confirmed"].includes(applicationRow.status)) return false;
        const jobOffer = jobOffers[applicationRow.id];
        return SIGNED_STATUSES.has(String(jobOffer?.status ?? "").trim().toUpperCase());
      }).length;

      accumulator[stage.key] = hiredByStatus + signedNotConfirmed;
      return accumulator;
    }

    accumulator[stage.key] = applicationRows.filter((applicationRow) => stage.statuses.includes(applicationRow.status)).length;
    return accumulator;
  }, {} as Record<string, number>);

  const closedCount = applicationRows.filter((applicationRow) => CLOSED_STATUSES.includes(applicationRow.status)).length;

  const activeStatuses = showClosed
    ? CLOSED_STATUSES
    : STAGES.find((stage) => stage.key === activeStage)?.statuses ?? [];

  const filteredApps = applicationRows.filter((app) => {
    const jobOffer = jobOffers[app.id];
    const isSignedOffer = SIGNED_STATUSES.has(String(jobOffer?.status ?? "").trim().toUpperCase());

    if (activeStage === "hired" && !showClosed) {
      const isHiredStatus = ["hired", "hire_confirmed"].includes(app.status);
      const matchesStage = isHiredStatus || isSignedOffer;
      const candidate = app.profiles;
      const searchTarget = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""} ${candidate?.email ?? ""}`.toLowerCase();
      const matchesSearch = !searchQuery || searchTarget.includes(searchQuery.toLowerCase());
      return matchesStage && matchesSearch;
    }

    const matchesStage = activeStatuses.includes(app.status);
    const candidate = app.profiles;
    const searchTarget = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""} ${candidate?.email ?? ""}`.toLowerCase();
    const matchesSearch = !searchQuery || searchTarget.includes(searchQuery.toLowerCase());
    return matchesStage && matchesSearch;
  });

  const handleCardClick = (app: ApplicationRow) => {
    setSelectedApplication(app);
    setIsDrawerOpen(true);
  };

  const handleQuickAction = async (app: ApplicationRow, action: NonNullable<QuickAction["action"]>) => {
    switch (action) {
      case "screen": {
        const response = await fetch(`/api/applications/${app.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "under_review" }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          toast.error(body?.error ?? "Failed to update status");
          return;
        }

        setApplicationRows((prev) => prev.map((row) => (row.id === app.id ? { ...row, status: "under_review" } : row)));
        toast.success("Moved to screening");
        return;
      }
      case "interview":
      case "view_interview":
      case "send_offer":
      case "view_offer":
        setSelectedApplication(app);
        setDrawerInitialTab(action);
        setIsDrawerOpen(true);
        return;
      case "confirm_hire": {
        const offer = jobOffers[app.id];
        const signedDocument = signedDocuments[app.id];
        const name = app.profiles ? `${app.profiles.first_name} ${app.profiles.last_name}`.trim() : "Candidate";
        const metadata = offer?.job_metadata ?? {};
        const storedSignedPdfUrl = signedDocument?.pdf_file_path || signedDocument?.docuseal_submission_url || signedDocument?.latest_docuseal_url || null;

        setConfirmSheetApp({
          applicationId: app.id,
          candidateName: name,
          candidateEmail: app.profiles?.email ?? "",
          jobTitle,
          isAlreadyConfirmed: app.status === "hire_confirmed",
          offerMetadata: {
            startDate: offer?.start_date ?? (typeof metadata.start_date === "string" ? metadata.start_date : null),
            workSetup: offer?.work_setup ?? (typeof metadata.work_setup === "string" ? metadata.work_setup : null),
            salaryAmount: offer?.salary ?? (typeof metadata.salary_amount === "number" ? metadata.salary_amount : null),
            salaryCurrency: typeof metadata.salary_currency === "string" ? metadata.salary_currency : "PHP",
            signedPdfUrl: storedSignedPdfUrl,
          },
          signedAt: offer?.updated_at ?? null,
          submittedAt: app.submitted_at,
        });

        if (offer?.id) {
          void fetch(`/api/hr/signed-pdf-url?offerId=${offer.id}`)
            .then((response) => response.json())
            .then((data: { url?: string }) => {
              if (!data.url) return;

              setConfirmSheetApp((current) =>
                current && current.applicationId === app.id
                  ? {
                      ...current,
                      offerMetadata: {
                        ...current.offerMetadata,
                        signedPdfUrl: data.url ?? null,
                      },
                    }
                  : current
              );
            })
            .catch(() => {
              // Signed PDF is optional; the sheet can still confirm the hire without it.
            });
        }
        return;
      }
    }
  };

  function handleHireConfirmed(applicationId: string) {
    setApplicationRows((prev) =>
      prev.map((app) =>
        app.id === applicationId
          ? { ...app, status: "hire_confirmed" as ApplicationStatus }
          : app
      )
    );
  }

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setDrawerInitialTab(null);
    setTimeout(() => setSelectedApplication(null), 300);
  };

  if (!applicationRows || applicationRows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">No applicants yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-4 border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate font-(family-name:--font-heading) text-xl font-bold text-text-primary">{jobTitle}</h1>
              <p className="text-xs text-text-secondary">Unified HR Applicant Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
            {STAGES.map((stage, index) => {
              const count = stageCounts[stage.key] ?? 0;
              return (
                <Fragment key={stage.key}>
                  <button
                    onClick={() => {
                      setActiveStage(stage.key);
                      setShowClosed(false);
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    type="button"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: count > 0 ? stage.color : "#e8e8e4",
                        color: count > 0 ? "#fff" : "#aaa",
                      }}
                    >
                      {count}
                    </div>
                    <span className="text-[9px] text-gray-500">{stage.label}</span>
                  </button>
                  {index < STAGES.length - 1 && <div className="mb-4 h-px w-4 flex-shrink-0 bg-gray-200" />}
                </Fragment>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {STAGES.map((stage) => (
              <button
                key={stage.key}
                onClick={() => {
                  setActiveStage(stage.key);
                  setShowClosed(false);
                }}
                className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: activeStage === stage.key && !showClosed ? stage.color : "#f5f5f0",
                  color: activeStage === stage.key && !showClosed ? "#fff" : "#555",
                }}
                type="button"
              >
                {stage.label}
                {stageCounts[stage.key] > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: activeStage === stage.key && !showClosed ? "rgba(255,255,255,0.3)" : "#e8e8e4",
                      color: activeStage === stage.key && !showClosed ? "#fff" : "#888",
                    }}
                  >
                    {stageCounts[stage.key]}
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={() => setShowClosed((value) => !value)}
              className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: showClosed ? "#6b7280" : "#f5f5f0",
                color: showClosed ? "#fff" : "#555",
              }}
              type="button"
            >
              Closed
              {closedCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: showClosed ? "rgba(255,255,255,0.3)" : "#e8e8e4",
                    color: showClosed ? "#fff" : "#888",
                  }}
                >
                  {closedCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search applicants by name or email"
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowClosed((value) => !value)}
              type="button"
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: showClosed ? "#111827" : "#f5f5f0",
                color: showClosed ? "#fff" : "#555",
              }}
            >
              Show closed
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
          {filteredApps.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-sm font-semibold text-text-primary">No applicants match this view</p>
              <p className="mt-1 text-xs text-text-secondary">Try another stage or clear your search filter.</p>
            </div>
          ) : (
            <div className="space-y-3 pb-6">
              {filteredApps.map((app) => {
                const candidate = app.profiles;
                const interview = interviewMap.get(app.id);
                const jobOffer = jobOffers[app.id];
                const fullName = getApplicantName(candidate);
                const statusColorClass = APPLICATION_STATUS_COLORS[app.status] ?? "bg-blue-50 text-blue-600";
                const jobOfferBadge = getJobOfferBadge(jobOffer);
                const hasSignedContract = jobOfferBadge?.isSigned ?? false;
                const quickAction = getQuickAction(app, hasSignedContract);
                const displayStatus = app.status.replace(/_/g, " ").toUpperCase();

                return (
                  <div
                    key={app.id}
                    onClick={() => handleCardClick(app)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleCardClick(app);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="group w-full min-w-0 cursor-pointer space-y-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all duration-200 hover:border-primary hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-sm text-primary transition-colors group-hover:bg-primary/20">
                          {fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary">
                            {fullName}
                          </p>
                          <p className="truncate text-xs text-text-secondary">{candidate?.email}</p>
                          {candidate?.phone && <p className="text-xs text-text-tertiary">{candidate.phone}</p>}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {app.match_score !== null && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              app.match_score >= 70
                                ? "bg-green-50 text-green-600"
                                : app.match_score >= 40
                                  ? "bg-yellow-50 text-yellow-600"
                                  : "bg-gray-100 text-text-secondary"
                            }`}
                          >
                            {app.match_score}%
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColorClass}`}>
                          {displayStatus}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                      {candidate?.city && <span>📍 {candidate.city}, {candidate.country}</span>}
                      <span className="ml-auto">Applied {new Date(app.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>

                    {app.cover_letter && (
                      <p className="line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-text-secondary">
                        {app.cover_letter}
                      </p>
                    )}

                    {interview && (
                      <div className="rounded-lg bg-purple-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-purple-700">
                            📅 Interview: {new Date(interview.scheduled_at).toLocaleDateString()} at {new Date(interview.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {interview.applicant_selection && (
                            <span className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-600">
                              {interview.applicant_selection === "online" ? "📹 Online" : "🏢 In-Person"}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {jobOfferBadge && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: jobOfferBadge.color }}>
                        <span>{jobOfferBadge.label}</span>
                        <span className="text-gray-400">
                          {jobOfferBadge.updatedAt ? new Date(jobOfferBadge.updatedAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                    )}

                    {hasSignedContract && app.status !== "hire_confirmed" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 12px",
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: 10,
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#16a34a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#15803d", margin: 0 }}>
                            Contract signed - awaiting your confirmation
                          </p>
                          {jobOffer?.updated_at && (
                            <p style={{ fontSize: 11, color: "#16a34a", margin: 0 }}>
                              Signed on {new Date(jobOffer.updated_at).toLocaleDateString("en-PH", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {app.status === "offer_sent" && jobOffer && !hasSignedContract && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          router.refresh();
                          toast.info("Checking signature status...");
                        }}
                        type="button"
                        className="mt-1 w-full rounded-xl border border-[#e8e8e4] bg-[#f5f5f0] py-2 text-xs font-medium text-[#555] transition-opacity hover:opacity-90"
                      >
                        ↻ Check if signed
                      </button>
                    )}

                    {quickAction && quickAction.action && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleQuickAction(app, quickAction.action);
                        }}
                        type="button"
                        className="mt-2 w-full rounded-xl py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: quickAction.color }}
                      >
                        {quickAction.label}
                      </button>
                    )}

                    {quickAction && !quickAction.action && (
                      <div className="mt-2 w-full rounded-xl bg-[#f0fdf4] py-2 text-center text-xs font-semibold" style={{ color: "#16a34a" }}>
                        {quickAction.label}
                      </div>
                    )}

                    {!quickAction && (
                      <div className="mt-2 w-full rounded-xl bg-[#f5f5f0] py-2 text-center text-xs font-semibold text-[#777]">
                        Click to view details
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedApplication && (
        <ApplicantDetailDrawer
          {...({
            application: selectedApplication as any,
            jobId,
            initialTab: drawerInitialTab,
            isCompletedLocked:
              String(selectedApplication.status).toUpperCase() === "COMPLETED" ||
              interviewMap.get(selectedApplication.id)?.status === "completed",
            isOpen: isDrawerOpen,
            onClose: handleCloseDrawer,
            onScheduled: () => router.refresh(),
          } as any)}
        />
      )}

      {confirmSheetApp && (
        <HireConfirmBottomSheet
          isOpen={!!confirmSheetApp}
          onClose={() => setConfirmSheetApp(null)}
          onHireConfirmed={handleHireConfirmed}
          applicationId={confirmSheetApp.applicationId}
          offerId={(jobOffers[confirmSheetApp.applicationId]?.id ?? signedDocuments[confirmSheetApp.applicationId]?.id ?? "")}
          candidateName={confirmSheetApp.candidateName}
          candidateEmail={confirmSheetApp.candidateEmail}
          jobTitle={confirmSheetApp.jobTitle}
          isAlreadyConfirmed={confirmSheetApp.isAlreadyConfirmed}
          offerMetadata={confirmSheetApp.offerMetadata}
          signedAt={confirmSheetApp.signedAt}
          submittedAt={confirmSheetApp.submittedAt}
        />
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import ApplicantDetailDrawer from "./applicant-detail-drawer";
import HireConfirmBottomSheet from "@/components/hr/HireConfirmBottomSheet";
import { createClient } from "@/lib/supabase/client";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { ApplicationStatus, Interview, Profile, Resume } from "@/lib/types";
import { getCurrentStage } from "@/lib/pipeline";
import { moveToScreening, moveToInterview, moveToHired } from "./pipeline-actions";
import { createHydratedOfferDraft } from "@/app/(auth)/actions/offer-actions";
import OfferReviewModal from "./offer-review-modal";

type CandidateProfile = Pick<Profile, "id" | "first_name" | "last_name" | "email" | "phone" | "city" | "country">;

type ResumeRow = Pick<Resume, "id" | "title" | "pdf_url" | "created_at">;

interface ApplicationRow {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  status: string;
  match_score: number | null;
  submitted_at: string;
  updated_at: string;
  cover_letter: string | null;
  hr_notes?: string | null;
  resume_id: string | null;
  profiles: CandidateProfile | null;
  resumes: ResumeRow | ResumeRow[] | null;
}

type OfferDraftRow = {
  id: string;
  application_id: string;
  salary: number | null;
  start_date: string | null;
  work_setup: string | null;
  department: string | null;
  probation_days: number | null;
  job_metadata: Record<string, unknown> | null;
  latest_docuseal_url: string | null;
  status: string;
  updated_at: string | null;
};

type RealtimeEventPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: unknown;
  old: unknown;
};

function isRealtimeEventPayload(payload: unknown): payload is RealtimeEventPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const eventType = (payload as { eventType?: unknown }).eventType;
  return eventType === "INSERT" || eventType === "UPDATE" || eventType === "DELETE";
}

function hasStringProperty<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string";
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
  statuses: string[];
  color: string;
}

const STAGES: StageDefinition[] = [
  { key: "new", label: "New", statuses: ["submitted", "draft"] as ApplicationStatus[], color: "#3b82f6" },
  { key: "screening", label: "Screening", statuses: ["under_review", "shortlisted"] as ApplicationStatus[], color: "#eab308" },
  { key: "interview", label: "Interview", statuses: ["interview_scheduled", "interviewed"] as ApplicationStatus[], color: "#a855f7" },
  { key: "offer", label: "Offer", statuses: ["negotiating", "offer_sent", "offer_accepted"] as ApplicationStatus[], color: "#f97316" },
  { key: "pre_employment", label: "Pre-employment", statuses: ["pre_employment"] as ApplicationStatus[], color: "#0ea5e9" },
  { key: "hired", label: "Hired", statuses: ["hired", "hire_confirmed"] as ApplicationStatus[], color: "#16a34a" },
];

const CLOSED_STATUSES = ["rejected", "withdrawn"] as string[];
const SIGNED_STATUSES = new Set(["SIGNED", "HIRED", "ACCEPTED", "HIRE_CONFIRMED"]);
const OFFER_SENT_STATUSES = new Set([
  "SENT",
  "NEGOTIATION_PENDING",
  "REVISED",
  "ACCEPTED",
  "SIGNED",
  "HIRED",
  "HIRE_CONFIRMED",
  "DECLINED",
  "EXPIRED",
]);

function getOfferDeliveryState(jobOffer?: JobOfferRow): "signed" | "sent" | "not_sent" | null {
  if (!jobOffer) return null;

  const normalizedStatus = String(jobOffer.status ?? "").trim().toUpperCase();
  if (SIGNED_STATUSES.has(normalizedStatus)) {
    return "signed";
  }

  if (OFFER_SENT_STATUSES.has(normalizedStatus)) {
    return "sent";
  }

  return "not_sent";
}

type QuickAction = {
  label: string;
  action: "screen" | "interview" | "view_interview" | "send_offer" | "view_offer" | "documents" | "confirm_hire" | null;
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
  if (app.status === "pre_employment" || (hasSignedContract && !["hired", "hire_confirmed"].includes(app.status))) {
    return { label: "Review docs", action: "documents", color: "#0ea5e9" };
  }

  switch (app.status) {
    case "submitted":
    case "draft":
      return { label: "Move to screening", action: "screen", color: "#eab308" };
    case "under_review":
    case "shortlisted":
      return { label: "Schedule interview", action: "interview", color: "#a855f7" };
    case "interview_scheduled":
      return { label: "Schedule Interview", action: "interview", color: "#a855f7" };
    case "interviewed":
      // Still allow scheduling (follow-up) from the interview panel — use the existing interview flow
      return { label: "Schedule interview", action: "interview", color: "#a855f7" };
    case "negotiating":
    case "offer_sent":
      // Offer stage should be read-only for quick actions in the pipeline view
      return null;
    case "pre_employment":
      return { label: "Review docs", action: "documents", color: "#0ea5e9" };
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

  const deliveryState = getOfferDeliveryState(jobOffer);
  const isSigned = deliveryState === "signed";

  const label = deliveryState === "signed"
    ? "✓ Signed - confirm hire"
    : deliveryState === "sent"
      ? "⏳ Awaiting signature"
      : "⚠ Offer not sent yet";

  const color = deliveryState === "signed"
    ? "#16a34a"
    : deliveryState === "sent"
      ? "#f97316"
      : "#b45309";

  return {
    label,
    color,
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
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const hasSignedPendingConfirmation = applications.some((app) => {
      const offer = initialJobOffers[app.id];
      return SIGNED_STATUSES.has(String(offer?.status ?? "").trim().toUpperCase()) && !["hired", "hire_confirmed"].includes(app.status);
    });

    return hasSignedPendingConfirmation ? "pre_employment" : "new";
  });
  const [showClosed, setShowClosed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<string | null>(null);
  const [confirmSheetApp, setConfirmSheetApp] = useState<ConfirmSheetAppState | null>(null);
  const [offerDraft, setOfferDraft] = useState<OfferDraftRow | null>(null);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const applicationIdsRef = useRef<Set<string>>(new Set(applications.map((app) => app.id)));
  const recomputeInFlightRef = useRef<Set<string>>(new Set());

  const triggerMatchScoreRecompute = useCallback(async (applicationId: string) => {
    if (recomputeInFlightRef.current.has(applicationId)) {
      return;
    }

    recomputeInFlightRef.current.add(applicationId);

    try {
      const response = await fetch("/api/compute-match-score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ application_id: applicationId }),
      });

      if (!response.ok) {
        console.warn("Failed to recompute match score:", await response.text());
      }
    } catch (error) {
      console.warn("Failed to recompute match score:", error);
    } finally {
      recomputeInFlightRef.current.delete(applicationId);
    }
  }, []);

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
    let isMounted = true;

    const setupRealtimeSubscription = () => {
      try {
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
            (payload: unknown) => {
              if (!isRealtimeEventPayload(payload)) {
                return;
              }

              if (payload.eventType === "DELETE") {
                if (!hasStringProperty(payload.old, "id")) return;
                const deletedId = payload.old.id;

                if (isMounted) {
                  setApplicationRows((prev) => prev.filter((app) => app.id !== deletedId));
                }
                return;
              }

              if (!hasStringProperty(payload.new, "id")) return;
              const changed = payload.new as Partial<ApplicationRow> & { id: string };

              if (payload.eventType === "UPDATE" && changed.match_score === null) {
                void triggerMatchScoreRecompute(changed.id);
              }

              if (isMounted) {
                setApplicationRows((prev) => {
                  const index = prev.findIndex((app) => app.id === changed.id);
                  if (index === -1) return prev;

                  const next = [...prev];
                  next[index] = { ...next[index], ...changed };
                  return next;
                });
              }
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
            (payload: unknown) => {
              if (!isRealtimeEventPayload(payload)) {
                return;
              }

              if (payload.eventType === "DELETE") {
                if (!hasStringProperty(payload.old, "application_id")) return;
                const deletedId = payload.old.application_id;
                if (!applicationIdsRef.current.has(deletedId)) return;

                if (isMounted) {
                  setInterviewMap((prev) => {
                    const next = new Map(prev);
                    next.delete(deletedId);
                    return next;
                  });
                }
                return;
              }

              if (!hasStringProperty(payload.new, "application_id")) return;
              const changed = payload.new as Interview & { application_id: string };
              const changedId = changed.application_id;
              if (!applicationIdsRef.current.has(changedId)) return;

              if (isMounted) {
                setInterviewMap((prev) => {
                  const next = new Map(prev);
                  next.set(changedId, changed);
                  return next;
                });
              }
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
            (payload: unknown) => {
              if (!isRealtimeEventPayload(payload)) {
                return;
              }

              if (payload.eventType === "DELETE") {
                if (!hasStringProperty(payload.old, "application_id")) return;
                const deletedId = payload.old.application_id;

                if (isMounted) {
                  setJobOffers((prev) => {
                    if (!prev[deletedId]) return prev;
                    const next = { ...prev };
                    delete next[deletedId];
                    return next;
                  });
                }
                return;
              }

              if (!hasStringProperty(payload.new, "application_id")) return;
              const changed = payload.new as JobOfferRow & { application_id: string };
              const changedId = changed.application_id;

              if (isMounted) {
                setJobOffers((prev) => ({
                  ...prev,
                  [changedId]: changed,
                }));
              }
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
            (payload: unknown) => {
              if (!isRealtimeEventPayload(payload)) {
                return;
              }

              if (payload.eventType === "DELETE") {
                if (!hasStringProperty(payload.old, "application_id")) return;
                const deletedId = payload.old.application_id;

                if (isMounted) {
                  setSignedDocuments((prev) => {
                    if (!prev[deletedId]) return prev;
                    const next = { ...prev };
                    delete next[deletedId];
                    return next;
                  });
                }
                return;
              }

              if (!hasStringProperty(payload.new, "application_id")) return;
              const changed = payload.new as SignedDocumentRow & { application_id: string };
              const changedId = changed.application_id;

              if (isMounted) {
                setSignedDocuments((prev) => ({
                  ...prev,
                  [changedId]: changed,
                }));
              }
            }
          )
          .subscribe((status: string) => {
            if (isMounted) {
              if (status === "SUBSCRIBED") {
                setRealtimeConnected(true);
                if (process.env.NODE_ENV === "development") {
                  console.log("[Realtime] Successfully subscribed to applicants channel");
                }
                } else if (status === "CHANNEL_ERROR") {
                setRealtimeConnected(false);
                console.warn("[Realtime] Channel error - updates may not sync");
              }
            }
          });

        return () => {
          void supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error("[Realtime] Failed to setup subscription:", error);
        // Realtime is optional - app still functions without it
        return () => {};
      }
    };

    const cleanup = setupRealtimeSubscription();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [jobId, triggerMatchScoreRecompute]);

  const stageCounts = STAGES.reduce((accumulator, stage) => {
    accumulator[stage.key] = applicationRows.filter((applicationRow) => stage.statuses.includes(applicationRow.status)).length;
    return accumulator;
  }, {} as Record<string, number>);

  const closedCount = applicationRows.filter((applicationRow) => CLOSED_STATUSES.includes(applicationRow.status)).length;

  const activeStatuses = showClosed
    ? CLOSED_STATUSES
    : STAGES.find((stage) => stage.key === activeTab)?.statuses ?? [];

  const filteredApps = applicationRows.filter((app) => {
    if (activeTab === "hired" && !showClosed) {
      const isHiredStatus = ["hired", "hire_confirmed"].includes(app.status);
      const matchesStage = isHiredStatus;
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

  // Helper function to get applications for a specific stage
  const getAppsForStage = (stageKey: string) => {
    const stage = STAGES.find((s) => s.key === stageKey);
    if (!stage) return [];
    return applicationRows.filter((app) => {
      if (stageKey === "hired") {
        const isHiredStatus = ["hired", "hire_confirmed"].includes(app.status);
        return isHiredStatus;
      }

      const matchesStage = stage.statuses.includes(app.status);
      const candidate = app.profiles;
      const searchTarget = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""} ${candidate?.email ?? ""}`.toLowerCase();
      const matchesSearch = !searchQuery || searchTarget.includes(searchQuery.toLowerCase());
      return matchesStage && matchesSearch;
    });
  };

  const handleCardClick = (app: ApplicationRow) => {
    setSelectedApplication(app);
    setIsDrawerOpen(true);
  };

  const handleQuickAction = async (app: ApplicationRow, action: NonNullable<QuickAction["action"]>) => {
    try {
      switch (action) {
        case "screen": {
          const result = await moveToScreening(app.id);
          if (!result.success) {
            toast.error(result.error || "Failed to move to screening");
            return;
          }
          toast.success(`✓ ${result.applicantName} moved to Screening`);
          return;
        }

        case "interview": {
          // Redirect HR to the central Interview Schedule page to use the existing scheduling flow
          try {
            router.push(`/interviews/schedule?applicationId=${encodeURIComponent(app.id)}`);
          } catch (err) {
            toast.error("Failed to open schedule page");
          }
          return;
        }

        case "view_interview": {
          router.push("/interviews");
          return;
        }

        case "send_offer": {
          toast.info("Preparing offer draft...");
          try {
            const result = await createHydratedOfferDraft(jobId, app.id);
            if (!result?.success) {
              toast.error(result?.error || "Failed to create offer draft");
              return;
            }

            setOfferDraft(result.offer);
            setIsOfferModalOpen(true);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create offer draft");
          }
          return;
        }

        case "view_offer": {
          setSelectedApplication(app);
          setDrawerInitialTab("view_offer");
          setIsDrawerOpen(true);
          return;
        }

        case "documents": {
          router.push(`/jobs/manage/${jobId}/applicants/${app.id}/documents`);
          return;
        }

        case "confirm_hire": {
          const result = await moveToHired(app.id);
          if (result.requiresModal && result.nextAction === "confirm_hire") {
            // Open the hire confirmation sheet
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
                  // Signed PDF is optional
                });
            }
            return;
          }
          if (!result.success) {
            toast.error(result.error || "Failed to confirm hire");
            return;
          }
          toast.success(`✓ ${result.applicantName} hired successfully`);
          return;
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
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
      <div className="flex h-full min-h-0 flex-col bg-background">
        {/* STICKY CONTROL HEADER */}
        <div className="shrink-0 space-y-3 border-b border-border/70 bg-surface/95 backdrop-blur-sm sticky top-0 z-20 pb-3">
          {/* Top Row: Title and Total Count */}
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-(family-name:--font-heading) text-lg font-bold text-text-primary">{jobTitle}</h1>
                <p className="text-xs text-text-secondary">
                  {applicationRows.length} Total Applicants
                </p>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search applicants..."
                  className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
                />
              </div>
              <svg className="h-4 w-4 shrink-0 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* MOBILE: Horizontal Scrollable Tabs */}
          <div className="md:hidden px-4">
            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none">
              {STAGES.map((stage) => {
                const appsCount = getAppsForStage(stage.key).length;
                return (
                  <button
                    key={stage.key}
                    onClick={() => setActiveTab(stage.key)}
                    className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: activeTab === stage.key ? stage.color : "#f5f5f0",
                      color: activeTab === stage.key ? "#fff" : "#666",
                      border: activeTab === stage.key ? "none" : "1px solid #e8e8e4",
                    }}
                  >
                    {stage.label} ({appsCount})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* DESKTOP: Multi-Column Pipeline View */}
        <div className="hidden md:flex h-full min-h-0 flex-1 overflow-x-auto gap-6 p-6 bg-gradient-to-b from-background to-surface">
          {STAGES.map((stage) => {
            const stageApps = getAppsForStage(stage.key);
            return (
              <div key={stage.key} className="flex-shrink-0 w-80 flex flex-col">
                {/* Column Header */}
                <div className="mb-4 pb-3 border-b border-border/50">
                  <h2 className="text-sm font-semibold text-text-primary">{stage.label}</h2>
                  <p className="text-xs text-text-secondary mt-1">
                    {stageApps.length} {stageApps.length === 1 ? "candidate" : "candidates"}
                  </p>
                </div>

                {/* Column Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {stageApps.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center">
                      <p className="text-xs text-text-secondary">No applicants</p>
                    </div>
                  ) : (
                    stageApps.map((app) => (
                      <ApplicantCardComponent
                        key={app.id}
                        app={app}
                        candidate={app.profiles}
                        interview={interviewMap.get(app.id)}
                        jobOffer={jobOffers[app.id]}
                        onCardClick={() => handleCardClick(app)}
                        onQuickAction={(action) => handleQuickAction(app, action)}
                        isMobile={false}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* MOBILE: Single-Column Tab View */}
        <div className="md:hidden h-full min-h-0 flex-1 overflow-y-auto">
          {filteredApps.length === 0 ? (
            <div className="p-4">
              <div className="rounded-2xl border border-border bg-surface p-6 text-center">
                <p className="text-sm font-semibold text-text-primary">No applicants match this view</p>
                <p className="mt-1 text-xs text-text-secondary">Try another stage or clear your search filter.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 pb-6">
              {filteredApps.map((app) => (
                <ApplicantCardComponent
                  key={app.id}
                  app={app}
                  candidate={app.profiles}
                  interview={interviewMap.get(app.id)}
                  jobOffer={jobOffers[app.id]}
                  onCardClick={() => handleCardClick(app)}
                  onQuickAction={(action) => handleQuickAction(app, action)}
                  isMobile={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedApplication && (
        <ApplicantDetailDrawer
          {...({
            application: selectedApplication,
            jobOffer: jobOffers[selectedApplication.id],
            jobId,
            initialTab: drawerInitialTab,
            isCompletedLocked:
              String(selectedApplication.status).toUpperCase() === "COMPLETED" ||
              interviewMap.get(selectedApplication.id)?.status === "completed",
            isOpen: isDrawerOpen,
            onClose: handleCloseDrawer,
            onScheduled: () => router.refresh(),
            onSendOffer: () => void handleQuickAction(selectedApplication as ApplicationRow, "send_offer"),
          })}
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

      {offerDraft && (
        <OfferReviewModal
          isOpen={isOfferModalOpen}
          onClose={() => {
            setIsOfferModalOpen(false);
            setOfferDraft(null);
          }}
          jobId={jobId}
          applicationId={offerDraft.application_id}
          offer={offerDraft}
          onSent={(offerId) => {
            setJobOffers((current) => ({
              ...current,
              [offerDraft.application_id]: {
                ...(current[offerDraft.application_id] ?? offerDraft),
                id: offerId,
                application_id: offerDraft.application_id,
                status: "SENT",
                latest_docuseal_url: offerDraft.latest_docuseal_url ?? current[offerDraft.application_id]?.latest_docuseal_url ?? null,
                updated_at: new Date().toISOString(),
              },
            }));
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Reusable applicant card component that adapts for mobile and desktop
 */
function ApplicantCardComponent({
  app,
  candidate,
  interview,
  jobOffer,
  onCardClick,
  onQuickAction,
  isMobile,
}: {
  app: ApplicationRow;
  candidate: CandidateProfile | null;
  interview?: Interview;
  jobOffer?: JobOfferRow;
  onCardClick: () => void;
  onQuickAction: (action: NonNullable<QuickAction["action"]>) => void;
  isMobile: boolean;
}) {
  const fullName = getApplicantName(candidate);
  const statusColorClass = (APPLICATION_STATUS_COLORS as Record<string, string>)[app.status] ?? "bg-blue-50 text-blue-600";
  const jobOfferBadge = getJobOfferBadge(jobOffer);
  const isOfferSentApplication = app.status === "offer_sent";
  const hasSignedContract = jobOfferBadge?.isSigned ?? false;
  const offerDeliveryState = getOfferDeliveryState(jobOffer);
  const currentStage = getCurrentStage(app.status as ApplicationStatus);
  const isOfferStage = app.status === "negotiating" || app.status === "offer_sent";
  const shouldShowCheckSigned = !hasSignedContract && isOfferStage && offerDeliveryState === "sent";
  const shouldShowSendOffer = !hasSignedContract && isOfferStage && !isOfferSentApplication && offerDeliveryState !== "sent";
  const quickAction = getQuickAction(app, hasSignedContract);
  const displayStatus = isOfferSentApplication ? "OFFER SENT" : currentStage?.label ?? app.status.replace(/_/g, " ").toUpperCase();
  const offerBadgeLabel = isOfferSentApplication ? "✓ Offer sent" : jobOfferBadge?.label ?? null;
  const offerBadgeColor = isOfferSentApplication ? "#16a34a" : jobOfferBadge?.color ?? null;
  const offerBadgeUpdatedAt = jobOfferBadge?.updatedAt ?? null;
  const now = new Date();
  const scheduledAt = interview ? new Date(interview.scheduled_at) : null;
  const diffMinutes = scheduledAt ? (scheduledAt.getTime() - now.getTime()) / 60000 : null;
  const showJoinRoom = diffMinutes !== null && diffMinutes <= 15 && diffMinutes >= -60;

  return (
    <div
      onClick={onCardClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCardClick();
        }
      }}
      role="button"
      tabIndex={0}
      className="group w-full cursor-pointer rounded-2xl border border-border bg-surface transition-all duration-200 hover:border-primary hover:shadow-md"
    >
      {/* Card Content */}
      <div className="p-4 pb-1 space-y-3">
        {/* Header: Name, Avatar, Score, Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-sm text-primary transition-colors group-hover:bg-primary/20">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary">
                {fullName}
              </p>
              <p className="truncate text-xs text-text-secondary">{candidate?.email}</p>
            </div>
          </div>

          {/* Score and Status - Right aligned */}
          <div className="flex shrink-0 items-center gap-2">
            {app.match_score !== null ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
                app.match_score >= 75
                  ? "bg-green-50 text-green-600"
                  : app.match_score >= 50
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
              }`}>
                {app.match_score}%
              </span>
            ) : (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap bg-gray-100 text-gray-400">
                Calculating...
              </span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusColorClass}`}>
              {displayStatus}
            </span>
          </div>
        </div>

        {/* Contact and Date */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          {candidate?.phone && <span>📞 {candidate.phone}</span>}
          {candidate?.city && <span>📍 {candidate.city}</span>}
          <span className="ml-auto">
            {new Date(app.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>

        {/* Cover Letter Preview */}
        {app.cover_letter && (
          <p className="line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-text-secondary">
            {app.cover_letter}
          </p>
        )}

        {/* Interview Info */}
        {interview && (
          <div className="rounded-lg bg-purple-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-purple-700">
                📅 {new Date(interview.scheduled_at).toLocaleDateString()} at{" "}
                {new Date(interview.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              {interview.applicant_selection && (
                <span className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-600 whitespace-nowrap">
                  {interview.applicant_selection === "online" ? "📹 Online" : "🏢 In-Person"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Job Offer Badge */}
        {isOfferStage && offerBadgeLabel && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: offerBadgeColor ?? undefined }}>
            <span className="font-medium">{offerBadgeLabel}</span>
            <span className="text-gray-400">
              {offerBadgeUpdatedAt ? new Date(offerBadgeUpdatedAt).toLocaleDateString() : ""}
            </span>
          </div>
        )}

        {(app.status === "interview_scheduled" || app.status === "interviewed") && !interview && (
          <p className="text-xs text-text-secondary">No interview scheduled yet</p>
        )}

        {/* Signed Contract Indicator */}
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
                Contract signed - awaiting confirmation
              </p>
              {jobOffer?.updated_at && (
                <p style={{ fontSize: 11, color: "#16a34a", margin: 0 }}>
                  Signed on {new Date(jobOffer.updated_at).toLocaleDateString("en-PH")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons - Layout adapts for mobile vs desktop */}
        <div className={isMobile ? "flex flex-col gap-2" : "space-y-2"}>
          {showJoinRoom && interview?.video_room_url && (
            <a
              href={`/interviews?id=${interview.id}`}
              onClick={(event) => event.stopPropagation()}
              className="block w-full rounded-xl py-2 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#7c3aed" }}
            >
              🎥 Join Interview Room
            </a>
          )}

          {/* Offer Delivery Action */}
          {shouldShowCheckSigned && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                // Refresh logic here
              }}
              type="button"
              className="w-full rounded-xl border border-[#e8e8e4] bg-[#f5f5f0] py-2 text-xs font-medium text-[#555] transition-opacity hover:opacity-90"
            >
              ↻ Check if signed
            </button>
          )}

          {shouldShowSendOffer && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                void onQuickAction("send_offer");
              }}
              type="button"
              style={{
                background: "linear-gradient(135deg, #ea580c 0%, #fb923c 100%)",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(234, 88, 12, 0.24)",
              }}
              className="w-full rounded-xl py-3 text-sm font-semibold tracking-wide transition-transform transition-shadow hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
            >
              Send Offer to DocuSeal
            </button>
          )}

          {/* Quick Action Button */}
          {quickAction && quickAction.action && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                void onQuickAction(quickAction.action!);
              }}
              type="button"
              className="w-full rounded-xl py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: quickAction.color }}
            >
              {quickAction.label}
            </button>
          )}

          {/* Hired Confirmation State */}
          {quickAction && !quickAction.action && (
            <div
              className="w-full rounded-xl py-2 text-center text-xs font-semibold"
              style={{ background: "#f0fdf4", color: "#16a34a" }}
            >
              {quickAction.label}
            </div>
          )}

          {/* Default CTA */}
          {!shouldShowCheckSigned && !shouldShowSendOffer && !quickAction && (
            <div className="w-full rounded-xl bg-[#f5f5f0] py-2 text-center text-xs font-semibold text-[#777]">
              Click to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

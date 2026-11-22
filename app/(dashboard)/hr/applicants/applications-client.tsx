"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { recalculateMatchScores } from "./actions";

import { withdrawApplication } from "./actions";
import { createClient } from "@/lib/supabase/client";
import ApplicationsKanbanBoard, { type ApplicationHubCard } from "./applications-kanban-board";
import { PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import { MatchScorePill } from "@/components/ui/match-score-pill";

type ApplicationsListItem = {
  id: string;
  job_posting_id: string;
  status: string;
  submitted_at: string;
  match_score: number | null;
  job_postings?: {
    id: string;
    title: string;
    location: string | null;
  }[] | null;
};

type ApplicationsInterviewItem = {
  interview_type: "online" | "in_person";
  status: string;
  scheduled_at: string;
  interviewer_notes: string | null;
};

type ActiveJobPosting = {
  id: string;
  title: string;
  created_by?: string | null;
  ownerFirstName?: string | null;
  ownerFullName?: string | null;
};

type ApplicationStatusPayload = {
  new: {
    status: string;
  };
};

const statusConfig: Record<string, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-surface text-text-muted" },
  submitted: { label: "Submitted", classes: "bg-primary/10 text-primary" },
  under_review: { label: "Under Review", classes: "bg-warning/10 text-warning" },
  shortlisted: { label: "Shortlisted", classes: "bg-warning/10 text-warning" },
  interview_scheduled: { label: "Interview Scheduled", classes: "bg-primary/10 text-primary" },
  interviewed: { label: "Interviewed", classes: "bg-primary/10 text-primary" },
  offer_sent: { label: "Offer Sent", classes: "bg-success/10 text-success" },
  hired: { label: "Hired", classes: "bg-success/10 text-success" },
  rejected: { label: "Rejected", classes: "bg-error/10 text-error" },
};

function ApplicationsList({
  applications,
  interviewMap,
}: {
  applications: ApplicationsListItem[];
  interviewMap: Record<string, ApplicationsInterviewItem>;
}) {
  return (
    <div className="space-y-3">
      {applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card-bg p-8 text-center">
          <p className="text-sm text-text-muted">
            You haven&apos;t applied to any jobs yet. Browse available positions to get started.
          </p>
        </div>
      ) : (
        applications.map((app) => {
          const job = app.job_postings as unknown as {
            id: string;
            title: string;
            location: string | null;
          } | undefined;

          const interview = interviewMap[app.id];
          const config = statusConfig[app.status] || statusConfig.submitted;

          return (
            <Link
              key={app.id}
              href={`/applicant/jobs/${app.job_posting_id}`}
              className="group block rounded-xl border border-border bg-card-bg p-4 transition-all duration-200 hover:border-primary hover:shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text-main transition-colors group-hover:text-primary">
                      {job?.title || "Unknown Job"}
                    </span>
                    {job?.location && <p className="text-xs text-text-muted">{job.location}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {app.match_score !== null && (
                      <MatchScorePill score={app.match_score} suffix="" size="xs" />
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${config.classes}`}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {(app.status === "interview_scheduled" ||
                  app.status === "interviewed" ||
                  app.status === "hired") &&
                  interview && (
                    <div className="rounded-xl bg-primary/5 p-3 space-y-1">
                      <p className="text-xs font-semibold text-primary">
                        Interview: {new Date(interview.scheduled_at).toLocaleString()}
                      </p>
                      {interview.interviewer_notes && (
                        <p className="text-xs text-text-muted">{interview.interviewer_notes}</p>
                      )}
                    </div>
                  )}

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-text-muted">
                    Applied {new Date(app.submitted_at).toLocaleDateString()}
                  </p>

                  {(app.status === "submitted" || app.status === "under_review") && (
                    <form action={withdrawApplication} onClick={(e) => e.stopPropagation()}>
                      <input type="hidden" name="application_id" value={app.id} />
                      <button
                        type="submit"
                        className="relative z-10 text-xs font-medium text-error hover:underline"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

export default function ApplicationsClient({
  applications,
  interviewMap,
  candidateId,
}: {
  applications: ApplicationsListItem[];
  interviewMap: Record<string, ApplicationsInterviewItem>;
  candidateId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const applicationIds = applications.map((app) => app.id);

    const channel = supabase
      .channel("candidate-applications-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "job_applications",
          filter: `applicant_id=eq.${candidateId}`,
        },
        (payload: ApplicationStatusPayload) => {
          toast.info(`Application updated to: ${payload.new.status}`);
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${candidateId}`,
        },
        () => {
          router.refresh();
        },
      );

    if (applicationIds.length > 0) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interviews",
          filter: `application_id=in.(${applicationIds.join(",")})`,
        },
        () => {
          router.refresh();
        },
      );
    }

    channel.subscribe((status: string) => {
      if (status === "CHANNEL_ERROR") {
        console.error("candidate-applications-live channel error: subscription failed");
      }
      if (status === "TIMED_OUT") {
        console.warn("candidate-applications-live channel timed out, retrying...");
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applications, candidateId, router]);

  return (
    <Suspense fallback={<div className="text-sm text-text-secondary">Loading...</div>}>
      <ApplicationsList applications={applications} interviewMap={interviewMap} />
    </Suspense>
  );
}

export function ApplicationsHubClient({
  applications,
  currentCompanyId,
  activeJobs,
  currentUserId,
  initialScope = "mine",
  initialJobId = "",
}: {
  applications: ApplicationHubCard[];
  currentCompanyId: string;
  activeJobs: ActiveJobPosting[];
  currentUserId?: string;
  initialScope?: "mine" | "all";
  initialJobId?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">(initialScope);
  const [localJobs, setLocalJobs] = useState<ActiveJobPosting[]>(() => activeJobs);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    setLocalJobs(activeJobs);
  }, [activeJobs]);

  // Count active (non-rejected, non-withdrawn) applicants per job in one pass
  const activeCountByJobId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const app of applications) {
      const status = String(app.status ?? "").toLowerCase();
      if (status === "rejected" || status === "withdrawn") continue;
      map[app.job_id] = (map[app.job_id] ?? 0) + 1;
    }
    return map;
  }, [applications]);

  const scopedJobs = useMemo(() => {
    if (scope === "all" || !currentUserId) {
      return localJobs;
    }
    return localJobs.filter((job) => job.created_by === currentUserId);
  }, [localJobs, scope, currentUserId]);

  const [selectedJobId, setSelectedJobId] = useState<string>(() => {
    const initialList =
      initialScope === "all" || !currentUserId
        ? activeJobs
        : activeJobs.filter((job) => job.created_by === currentUserId);
    if (initialJobId && initialList.some((j) => j.id === initialJobId)) {
      return initialJobId;
    }
    return initialList[0]?.id ?? "";
  });

  // Ensure selectedJobId stays valid within current scope
  const effectiveSelectedJobId = useMemo(() => {
    if (selectedJobId && scopedJobs.some((j) => j.id === selectedJobId)) {
      return selectedJobId;
    }
    return scopedJobs[0]?.id ?? "";
  }, [scopedJobs, selectedJobId]);

  function updateUrlParams(nextScope: "mine" | "all", nextJobId: string) {
    const params = new URLSearchParams();
    params.set("scope", nextScope);
    if (nextJobId) {
      params.set("job", nextJobId);
    }
    router.replace(`/hr/applicants?${params.toString()}`, { scroll: false });
  }

  function handleScopeChange(nextScope: "mine" | "all") {
    setScope(nextScope);
    const nextList =
      nextScope === "all" || !currentUserId
        ? localJobs
        : localJobs.filter((job) => job.created_by === currentUserId);
    const nextJobId = nextList.some((j) => j.id === effectiveSelectedJobId)
      ? effectiveSelectedJobId
      : nextList[0]?.id ?? "";
    setSelectedJobId(nextJobId);
    updateUrlParams(nextScope, nextJobId);
  }

  function handleSelectJob(nextJobId: string) {
    setSelectedJobId(nextJobId);
    updateUrlParams(scope, nextJobId);
  }

  const selectedJobIndex = useMemo(
    () => scopedJobs.findIndex((j) => j.id === effectiveSelectedJobId),
    [scopedJobs, effectiveSelectedJobId],
  );

  const selectedApplications = useMemo(
    () =>
      effectiveSelectedJobId
        ? applications.filter((application) => application.job_id === effectiveSelectedJobId)
        : [],
    [applications, effectiveSelectedJobId],
  );

  const activeApplicantsCount = useMemo(
    () => (effectiveSelectedJobId ? activeCountByJobId[effectiveSelectedJobId] ?? 0 : 0),
    [activeCountByJobId, effectiveSelectedJobId],
  );

  const selectedJob = useMemo(
    () => scopedJobs.find((j) => j.id === effectiveSelectedJobId) ?? null,
    [scopedJobs, effectiveSelectedJobId],
  );

  return (
    <div className="flex w-full min-w-0 flex-col space-y-5 text-text-main">
      {/* Header */}
      <PageHeroHeader
        eyebrow="Recruitment Pipeline"
        title="Application Hub"
        subtitle="Manage candidate pipelines across roles"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-indigo-100 bg-white/90 p-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleScopeChange("mine")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  scope === "mine"
                    ? "bg-[#1E1B4B] text-white shadow-xs"
                    : "text-slate-600 hover:text-[#1E1B4B]"
                }`}
              >
                My Jobs
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange("all")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  scope === "all"
                    ? "bg-[#1E1B4B] text-white shadow-xs"
                    : "text-slate-600 hover:text-[#1E1B4B]"
                }`}
              >
                All Company
              </button>
            </div>
            <button
              type="button"
              disabled={recalculating}
              onClick={async () => {
                setRecalculating(true);
                const result = await recalculateMatchScores();
                setRecalculating(false);
                if (!result.success) toast.error(result.error);
                else {
                  toast.success(`Scores: ${result.scored} scored, ${result.skipped} skipped, ${result.failed} failed`);
                  router.refresh();
                }
              }}
              className="h-9 rounded-xl border border-indigo-100 bg-white/80 px-3.5 text-xs font-semibold text-[#1E1B4B] backdrop-blur-md transition-colors hover:bg-white disabled:opacity-50"
            >
              {recalculating ? "Recalculating..." : "Recalculate scores"}
            </button>
            <div className="inline-flex items-center rounded-full bg-[#EDE9F9] px-3.5 py-1.5 text-xs font-bold text-[#1E1B4B]">
              <span className="mr-1.5">{activeApplicantsCount}</span>
              <span>active applicant{activeApplicantsCount === 1 ? "" : "s"}</span>
            </div>
            {selectedJob ? (
              <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-[#1E1B4B]">
                Owner: {selectedJob.ownerFullName || selectedJob.ownerFirstName || "HR Team"}
              </div>
            ) : null}
          </div>
        }
      />

      {/* Single-Row Job Selector Bar */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-indigo-100/80 bg-white/80 px-3.5 py-2.5 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        {scopedJobs.length === 0 ? (
          <div className="px-1 py-1 text-xs text-text-muted">
            {scope === "mine"
              ? "You do not own any job postings yet. Switch to All Company to view team jobs."
              : "No job postings found in this workspace."}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EDE9F9] text-[#1E1B4B]">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted md:inline">
                Role
              </span>
              <div className="relative min-w-0 flex-1 sm:max-w-lg">
                <select
                  aria-label="Select job posting"
                  value={effectiveSelectedJobId}
                  onChange={(e) => handleSelectJob(e.target.value)}
                  className="h-9 w-full appearance-none truncate rounded-xl border border-indigo-100 bg-white pl-3 pr-9 text-xs font-semibold text-[#1E1B4B] outline-none transition-colors hover:border-indigo-200 focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
                >
                  {scopedJobs.map((job) => {
                    const activeCount = activeCountByJobId[job.id] ?? 0;
                    const ownerSuffix =
                      scope === "all" ? ` · Owner: ${job.ownerFirstName || "HR Team"}` : "";
                    return (
                      <option key={job.id} value={job.id}>
                        {job.title} ({activeCount}){ownerSuffix}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {scopedJobs.length} {scopedJobs.length === 1 ? "role" : "roles"}
              </span>
              {scopedJobs.length > 1 ? (
                <div className="inline-flex items-center rounded-xl border border-indigo-100 bg-white p-0.5">
                  <button
                    type="button"
                    aria-label="Previous job"
                    disabled={selectedJobIndex <= 0}
                    onClick={() => {
                      if (selectedJobIndex > 0) {
                        handleSelectJob(scopedJobs[selectedJobIndex - 1].id);
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-indigo-50 hover:text-[#1E1B4B] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next job"
                    disabled={selectedJobIndex < 0 || selectedJobIndex >= scopedJobs.length - 1}
                    onClick={() => {
                      if (selectedJobIndex >= 0 && selectedJobIndex < scopedJobs.length - 1) {
                        handleSelectJob(scopedJobs[selectedJobIndex + 1].id);
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-indigo-50 hover:text-[#1E1B4B] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Kanban Board Container */}
      <SolidSurfaceCard className="flex-1 min-h-[500px] w-full min-w-0 overflow-hidden p-4">
        <ApplicationsKanbanBoard
          applications={selectedApplications}
          currentCompanyId={currentCompanyId}
          tenantJobIds={activeJobs.map((job) => job.id)}
        />
      </SolidSurfaceCard>
    </div>
  );
}
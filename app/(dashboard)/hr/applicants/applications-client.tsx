"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
}: {
  applications: ApplicationHubCard[];
  currentCompanyId: string;
  activeJobs: ActiveJobPosting[];
}) {
  const router = useRouter();
  const [selectedJobId, setSelectedJobId] = useState("all");
  const [localJobs, setLocalJobs] = useState<ActiveJobPosting[]>(() => activeJobs);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    setLocalJobs(activeJobs);
  }, [activeJobs]);

  const selectedApplications = useMemo(
    () => selectedJobId === "all"
      ? applications
      : applications.filter((application) => application.job_id === selectedJobId),
    [applications, selectedJobId],
  );

  const activeApplicantsCount = useMemo(
    () =>
      selectedApplications.filter(
        (application) => !["rejected", "withdrawn"].includes(String(application.status).toLowerCase())
      ).length,
    [selectedApplications],
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
              <span>applicant{activeApplicantsCount === 1 ? "" : "s"}</span>
            </div>
            <button className="h-9 rounded-xl bg-[#1E1B4B] px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900">
              + Add Candidate
            </button>
          </div>
        }
      />

      {/* Frosted Glass Job Tabs Bar */}
      <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-indigo-100/80 bg-white/75 p-2 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => setSelectedJobId("all")}
          className={`flex-shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
            selectedJobId === "all"
              ? "bg-[#1E1B4B] text-white shadow-xs"
              : "bg-white text-text-muted hover:text-[#1E1B4B] border border-slate-200/80"
          }`}
        >
          All roles
        </button>
        {localJobs.map((job) => (
          <button
            key={job.id}
            onClick={() => setSelectedJobId(job.id)}
            data-job-id={job.id}
            className={`flex-shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              job.id === selectedJobId
                ? "bg-[#1E1B4B] text-white shadow-xs"
                : "bg-white text-text-muted hover:text-[#1E1B4B] border border-slate-200/80"
            }`}
          >
            {job.title}
          </button>
        ))}
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
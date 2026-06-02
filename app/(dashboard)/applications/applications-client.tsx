"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withdrawApplication } from "./actions";
import { createClient } from "@/lib/supabase/client";
import ApplicationsKanbanBoard, { type ApplicationHubCard } from "./applications-kanban-board";

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

const statusConfig: Record<string, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-gray-100 text-text-secondary" },
  submitted: { label: "Submitted", classes: "bg-blue-50 text-info" },
  under_review: { label: "Under Review", classes: "bg-amber-50 text-amber-700" },
  shortlisted: { label: "Shortlisted", classes: "bg-yellow-50 text-warning" },
  interview_scheduled: { label: "Interview Scheduled", classes: "bg-purple-50 text-purple-700" },
  interviewed: { label: "Interviewed", classes: "bg-purple-50 text-purple-700" },
  offer_sent: { label: "Offer Sent", classes: "bg-green-50 text-success" },
  hired: { label: "Hired", classes: "bg-green-50 text-success" },
  rejected: { label: "Rejected", classes: "bg-red-50 text-danger" },
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
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
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
              href={`/applications/${app.id}`}
              className="block group transition-all duration-200"
            >
              <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 group-hover:border-primary/50 group-hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-text-primary group-hover:text-primary truncate block transition-colors">
                      {job?.title || "Unknown Job"}
                    </span>
                    {job?.location && <p className="text-xs text-text-secondary">{job.location}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.match_score !== null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          app.match_score >= 70
                            ? "bg-green-50 text-success"
                            : app.match_score >= 40
                              ? "bg-yellow-50 text-warning"
                              : "bg-gray-100 text-text-secondary"
                        }`}
                      >
                        {app.match_score}%
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.classes}`}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {(app.status === "interview_scheduled" ||
                  app.status === "interviewed" ||
                  app.status === "hired") &&
                  interview && (
                    <div className="rounded-xl bg-purple-50 p-3 space-y-1">
                      <p className="text-xs font-medium text-purple-700">
                        Interview: {new Date(interview.scheduled_at).toLocaleString()}
                      </p>
                      {interview.interviewer_notes && (
                        <p className="text-xs text-purple-600">{interview.interviewer_notes}</p>
                      )}
                    </div>
                  )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary">
                    Applied {new Date(app.submitted_at).toLocaleDateString()}
                  </p>

                  {(app.status === "submitted" || app.status === "under_review") && (
                    <form action={withdrawApplication} onClick={(e) => e.stopPropagation()}>
                      <input type="hidden" name="application_id" value={app.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-danger hover:underline relative z-10"
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
  // Localized job tabs state so the UI can add a temporary job without affecting server-side data
  const [selectedJobId, setSelectedJobId] = useState("");
  const [localJobs, setLocalJobs] = useState<ActiveJobPosting[]>(() => activeJobs);

  useEffect(() => {
    // sync incoming activeJobs to localJobs when the prop changes
    setLocalJobs(activeJobs);
  }, [activeJobs]);

  const selectedApplications = useMemo(
    () => (selectedJobId ? applications.filter((application) => application.job_posting_id === selectedJobId) : []),
    [applications, selectedJobId],
  );

  const hasActiveJobs = localJobs.length > 0;

  useEffect(() => {
    if (hasActiveJobs && !selectedJobId) {
      setSelectedJobId(localJobs[0].id);
    }
  }, [localJobs, hasActiveJobs, selectedJobId]);

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] min-h-0 flex-col overflow-hidden bg-[#fcf8ff] text-[#171542]">
      <div className="mb-[32px] space-y-1">
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] font-semibold tracking-tight text-on-background">
          Application Hub
        </h1>
        <p className="text-[14px] text-secondary">Manage candidate pipelines across all active roles</p>
      </div>

      <div className="mb-[20px] flex w-full flex-col gap-[16px] md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-[8px] overflow-x-auto max-w-full custom-scrollbar pb-1">
          {localJobs.map((job) => (
            <button
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              data-job-id={job.id}
              className={`flex-shrink-0 whitespace-nowrap rounded-lg px-[16px] py-[10px] text-[14px] font-medium transition-colors ${job.id === selectedJobId ? "bg-[#7c7aac] text-white shadow-sm" : "bg-transparent text-secondary hover:bg-surface-container hover:text-[#4a4880]"}`}
            >
              {job.title}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-[8px] md:ml-auto">
          <div className="inline-flex items-center rounded-full bg-[#ede9fe] px-[12px] py-[6px] text-[12px] text-[#5b21b6]">
            <span className="mr-2 font-semibold">{selectedApplications.length}</span>
            <span>applicants</span>
          </div>

          <button className="flex h-9 items-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white px-3 text-sm transition-colors hover:bg-[#efebff]">
            <span className="material-symbols-outlined">filter_list</span>
            Filter
          </button>

          <button className="h-9 rounded-[8px] bg-[#7c3aed] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9]">
            Add Candidate
          </button>
        </div>
      </div>

      <section className="min-h-[480px] flex-1 min-h-0">
        <ApplicationsKanbanBoard
          applications={selectedApplications}
          currentCompanyId={currentCompanyId}
          tenantJobIds={activeJobs.map((job) => job.id)}
        />
      </section>
    </div>
  );
}

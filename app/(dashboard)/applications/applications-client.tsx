"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { withdrawApplication } from "./actions";
import { createClient } from "@/lib/supabase/client";

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
                    {job?.location && (
                      <p className="text-xs text-text-secondary">{job.location}</p>
                    )}
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
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
                    >
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Interview Details */}
                {(app.status === "interview_scheduled" ||
                  app.status === "interviewed" ||
                  app.status === "hired") &&
                  interview && (
                    <div className="rounded-xl bg-purple-50 p-3 space-y-1">
                      <p className="text-xs font-medium text-purple-700">
                        Interview: {new Date(interview.scheduled_at).toLocaleString()}
                      </p>
                      {interview.interviewer_notes && (
                        <p className="text-xs text-purple-600">
                          {interview.interviewer_notes}
                        </p>
                      )}
                    </div>
                  )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary">
                    Applied {new Date(app.submitted_at).toLocaleDateString()}
                  </p>

                  {(app.status === "submitted" ||
                    app.status === "under_review") && (
                    <form
                      action={withdrawApplication}
                      onClick={(e) => e.stopPropagation()}
                    >
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
          filter: `candidate_id=eq.${candidateId}`
        },
        () => {
          router.refresh();
        }
      )
    if (applicationIds.length > 0) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interviews",
          filter: `application_id=in.(${applicationIds.join(",")})`
        },
        () => {
          router.refresh();
        }
      );
    }

    channel.subscribe((status) => {
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
    <Suspense
      fallback={<div className="text-sm text-text-secondary">Loading...</div>}
    >
      <ApplicationsList
        applications={applications}
        interviewMap={interviewMap}
      />
    </Suspense>
  );
}
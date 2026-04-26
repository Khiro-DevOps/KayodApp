"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { withdrawApplication } from "./actions";

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
  id: string;
  application_id: string;
  interview_type: "online" | "in_person";
  status: string;
  scheduled_at: string;
  interviewer_notes: string | null;
};

const statusConfig: Record<string, { label: string; classes: string }> = {
  applied: { label: "Applied", classes: "bg-blue-50 text-info" },
  shortlisted: { label: "Shortlisted", classes: "bg-yellow-50 text-warning" },
  interview: { label: "Interview", classes: "bg-purple-50 text-purple-600" },
  hired: { label: "Hired", classes: "bg-green-50 text-success" },
};

function ApplicationsList({
  applications,
  interviewMap,
}: {
  applications: ApplicationsListItem[];
  interviewMap: Record<string, ApplicationsInterviewItem>;
}) {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  if (applications.length === 0 && !success) return null;

  return (
    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
      <div className="space-y-3 pb-4">
        {success && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-success">
            {success}
          </div>
        )}

        {applications.map((app) => {
          const job = app.job_postings as unknown as {
            id: string;
            title: string;
            location: string | null;
          } | undefined;

          const config = statusConfig[app.status] || statusConfig.applied;

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
                  interviewMap[app.id] && (
                    <div className="rounded-xl bg-purple-50 p-3 space-y-1">
                      <p className="text-xs font-medium text-purple-700">
                        Interview:{" "}
                        {new Date(
                          interviewMap[app.id].scheduled_at
                        ).toLocaleString()}
                      </p>
                      {interviewMap[app.id].interviewer_notes && (
                        <p className="text-xs text-purple-600">
                          {interviewMap[app.id].interviewer_notes}
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
                      onClick={(e) => e.stopPropagation()} // Prevents navigation when clicking withdraw
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
        })}
      </div>
    </div>
  );
}

export default function ApplicationsClient({
  applications,
  interviewMap,
}: {
  applications: ApplicationsListItem[];
  interviewMap: Record<string, ApplicationsInterviewItem>;
}) {
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
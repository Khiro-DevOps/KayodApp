"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Application, Interview } from "@/lib/types";
import Link from "next/link";
import { withdrawApplication } from "./actions";

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
  applications: Application[];
  interviewMap: Record<string, Interview>;
}) {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  if (applications.length === 0 && !success) return null;

  return (
    <div className="space-y-3">
      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-success">
          {success}
        </div>
      )}

      {applications.map((app) => {
        const job = app.job_listings as unknown as {
          id: string;
          title: string;
          location: string | null;
          employers: { company_name: string } | null;
        } | undefined;

        const config = statusConfig[app.status] || statusConfig.applied;

        return (
          <div
            key={app.id}
            className="rounded-2xl bg-surface border border-border p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/jobs/${app.job_listing_id}`}
                  className="text-sm font-medium text-text-primary hover:text-primary truncate block"
                >
                  {job?.title || "Unknown Job"}
                </Link>
                {job?.employers && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {job.employers.company_name}
                  </p>
                )}
                {job?.location && (
                  <p className="text-xs text-text-secondary">{job.location}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {app.match_score !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    app.match_score >= 70 ? 'bg-green-50 text-success' :
                    app.match_score >= 40 ? 'bg-yellow-50 text-warning' :
                    'bg-gray-100 text-text-secondary'
                  }`}>
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
            {(app.status === "interview" || app.status === "hired") &&
              interviewMap[app.id] && (
                <div className="rounded-xl bg-purple-50 p-3 space-y-1">
                  <p className="text-xs font-medium text-purple-700">
                    Interview: {new Date(interviewMap[app.id].scheduled_at).toLocaleString()}
                  </p>
                  {interviewMap[app.id].notes && (
                    <p className="text-xs text-purple-600">
                      {interviewMap[app.id].notes}
                    </p>
                  )}
                </div>
              )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-text-secondary">
                Applied {new Date(app.created_at).toLocaleDateString()}
              </p>

              {app.status === "applied" && (
                <form action={withdrawApplication}>
                  <input type="hidden" name="application_id" value={app.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Withdraw
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ApplicationsClient({
  applications,
  interviewMap,
}: {
  applications: Application[];
  interviewMap: Record<string, Interview>;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-text-secondary">Loading...</div>}>
      <ApplicationsList applications={applications} interviewMap={interviewMap} />
    </Suspense>
  );
}

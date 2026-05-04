"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
  id: string;
  application_id: string;
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
  interview_scheduled: { label: "Interview Scheduled", classes: "bg-purple-50 text-purple-600" },
  interviewed: { label: "Interviewed", classes: "bg-indigo-50 text-indigo-700" },
  offer_sent: { label: "Offer Sent", classes: "bg-emerald-50 text-emerald-700" },
  hired: { label: "Hired", classes: "bg-green-50 text-success" },
  rejected: { label: "Rejected", classes: "bg-red-50 text-danger" },
  withdrawn: { label: "Withdrawn", classes: "bg-gray-100 text-text-secondary" },
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
                        Interview:{" "}
                        {new Date(
                          interview.scheduled_at
                        ).toLocaleString()}
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
  const [liveApplications, setLiveApplications] = useState<ApplicationsListItem[]>(applications);
  const [liveInterviewMap, setLiveInterviewMap] = useState<Record<string, ApplicationsInterviewItem>>(interviewMap);
  const applicationIdsRef = useRef<Set<string>>(new Set(applications.map((app) => app.id)));

  useEffect(() => {
    setLiveApplications(applications);
    applicationIdsRef.current = new Set(applications.map((app) => app.id));
  }, [applications]);

  useEffect(() => {
    setLiveInterviewMap(interviewMap);
  }, [interviewMap]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("candidate-applications-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String((payload.old as { id?: string } | null)?.id ?? "");
            if (!deletedId) return;

            if (applicationIdsRef.current.has(deletedId)) {
              setLiveApplications((prev) => prev.filter((app) => app.id !== deletedId));
              setLiveInterviewMap((prev) => {
                const next = { ...prev };
                delete next[deletedId];
                return next;
              });
              applicationIdsRef.current.delete(deletedId);
            }

            return;
          }

          const changed = payload.new as Partial<ApplicationsListItem> | null;
          if (!changed?.id || !applicationIdsRef.current.has(changed.id)) return;

          setLiveApplications((prev) => {
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
        { event: "*", schema: "public", table: "interviews" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedApplicationId = String(
              (payload.old as { application_id?: string } | null)?.application_id ?? ""
            );
            if (!deletedApplicationId || !applicationIdsRef.current.has(deletedApplicationId)) return;

            setLiveInterviewMap((prev) => {
              const next = { ...prev };
              delete next[deletedApplicationId];
              return next;
            });
            return;
          }

          const changed = payload.new as ApplicationsInterviewItem | null;
          if (!changed?.application_id || !applicationIdsRef.current.has(changed.application_id)) return;

          setLiveInterviewMap((prev) => ({
            ...prev,
            [changed.application_id]: {
              ...prev[changed.application_id],
              ...changed,
            },
          }));
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error("candidate-applications-live channel error:", err);
        }
        if (status === "TIMED_OUT") {
          console.warn("candidate-applications-live channel timed out, retrying...");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Suspense
      fallback={<div className="text-sm text-text-secondary">Loading...</div>}
    >
      <ApplicationsList
        applications={liveApplications}
        interviewMap={liveInterviewMap}
      />
    </Suspense>
  );
}
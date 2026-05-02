"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Interview } from "@/lib/types";
import ApplicantDetailDrawer from "./applicant-detail-drawer";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { ApplicationStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface CandidateProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
}

interface ApplicationRow {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  match_score: number | null;
  submitted_at: string;
  cover_letter: string | null;
  hr_notes: string | null;
  resume_id: string | null;
  profiles: CandidateProfile | null;
}

interface ApplicantsListClientProps {
  jobId: string;
  applications: ApplicationRow[];
  interviews: Map<string, Interview>;
}

export default function ApplicantsListClient({
  jobId,
  applications,
  interviews,
}: ApplicantsListClientProps) {
  const router = useRouter();
  const [applicationRows, setApplicationRows] = useState<ApplicationRow[]>(applications);
  const [interviewMap, setInterviewMap] = useState<Map<string, Interview>>(interviews);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const applicationIdsRef = useRef<Set<string>>(new Set(applications.map((app) => app.id)));

  useEffect(() => {
    setApplicationRows(applications);
  }, [applications]);

  useEffect(() => {
    applicationIdsRef.current = new Set(applicationRows.map((app) => app.id));
  }, [applicationRows]);

  useEffect(() => {
    setInterviewMap(interviews);
  }, [interviews]);

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

            if (index === -1) {
              return prev;
            }

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  const handleCardClick = (app: ApplicationRow) => {
    setSelectedApplication(app);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedApplication(null), 300);
  };

  if (!applicationRows || applicationRows.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-6 text-center">
        <p className="text-sm text-text-secondary">No applicants yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full min-h-0 overflow-y-auto pr-1">
        <div className="space-y-3 pb-6">
          {applicationRows.map((app) => {
            const candidate = app.profiles;
            const interview = interviewMap.get(app.id);
            const fullName = candidate
              ? `${candidate.first_name} ${candidate.last_name}`
              : "Unknown";
            const isCompleted =
              String(app.status).toUpperCase() === "COMPLETED" ||
              interview?.status === "completed";
            const displayStatus = app.status.replace(/_/g, " ").toUpperCase();
            const statusColorClass = APPLICATION_STATUS_COLORS[app.status] ?? "bg-blue-50 text-blue-600";

            return (
              <button
                key={app.id}
                onClick={() => handleCardClick(app)}
                className="w-full min-w-0 text-left rounded-2xl bg-surface border border-border p-4 space-y-3 hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm group-hover:bg-primary/20 transition-colors">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                        {fullName}
                      </p>
                      <p className="text-xs text-text-secondary truncate">{candidate?.email}</p>
                      {candidate?.phone && (
                        <p className="text-xs text-text-tertiary">{candidate.phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.match_score !== null && (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        app.match_score >= 70
                          ? "bg-green-50 text-green-600"
                          : app.match_score >= 40
                          ? "bg-yellow-50 text-yellow-600"
                          : "bg-gray-100 text-text-secondary"
                      }`}>
                        {app.match_score}%
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColorClass}`}>
                      {displayStatus}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-text-secondary flex-wrap">
                  {candidate?.city && (
                    <span>📍 {candidate.city}, {candidate.country}</span>
                  )}
                  <span className="ml-auto">
                    Applied {new Date(app.submitted_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                {app.cover_letter && (
                  <p className="text-xs text-text-secondary bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                    {app.cover_letter}
                  </p>
                )}

                {interview && (
                  <div className="rounded-lg bg-purple-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-purple-700">
                        📅 Interview:{" "}
                        {new Date(interview.scheduled_at).toLocaleDateString()} at{" "}
                        {new Date(interview.scheduled_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {interview.applicant_selection && (
                        <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-1 rounded">
                          {interview.applicant_selection === "online" ? "📹 Online" : "🏢 In-Person"}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 text-xs text-text-secondary group-hover:text-primary transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.5 9a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" clipRule="evenodd" />
                  </svg>
                  {isCompleted ? "Click to view details" : "Click to view details & schedule interview"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedApplication && (
        <ApplicantDetailDrawer
          application={selectedApplication as any}
          jobId={jobId}
          isCompletedLocked={
            String(selectedApplication.status).toUpperCase() === "COMPLETED" ||
            interviewMap.get(selectedApplication.id)?.status === "completed"
          }
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          onScheduled={() => router.refresh()}
        />
      )}
    </>
  );
}
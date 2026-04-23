"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Application, Interview } from "@/lib/types";
import ApplicantDetailDrawer from "./applicant-detail-drawer";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";

interface ApplicantsListClientProps {
  jobId: string;
  applications: Application[];
  interviews: Map<string, Interview>;
}

export default function ApplicantsListClient({
  jobId,
  applications,
  interviews,
}: ApplicantsListClientProps) {
  const router = useRouter();
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleCardClick = (app: Application) => {
    setSelectedApplication(app);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedApplication(null), 300);
  };

  if (!applications || applications.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-6 text-center">
        <p className="text-sm text-text-secondary">No applicants yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Applicant Cards */}
      <div className="h-full min-h-0 overflow-y-auto pr-1">
        <div className="space-y-3 pb-6">
        {applications.map((app) => {
          const candidate = app.profiles as unknown as {
            id: string;
            first_name: string;
            last_name: string;
            email: string;
            phone?: string;
          } | undefined;
          const resume = app.resumes as unknown as {
            title: string;
            pdf_url?: string;
          } | null;
          const interview = interviews.get(app.id);

          const fullName = candidate
            ? `${candidate.first_name} ${candidate.last_name}`
            : "Unknown";

          return (
            <button
              key={app.id}
              onClick={() => handleCardClick(app)}
              className="w-full min-w-0 text-left rounded-2xl bg-surface border border-border p-4 space-y-3 hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              {/* Applicant Info */}
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
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    APPLICATION_STATUS_COLORS[app.status as keyof typeof APPLICATION_STATUS_COLORS] || 
                    "bg-blue-50 text-blue-600"
                  }`}>
                    {app.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Resume + Applied Date */}
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                {resume && (
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-9Z" />
                    </svg>
                    {resume.title}
                  </span>
                )}
                <span className="ml-auto">
                  Applied {new Date(app.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>

              {/* Cover Letter Preview */}
              {app.cover_letter && (
                <p className="text-xs text-text-secondary bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                  {app.cover_letter}
                </p>
              )}

              {/* Interview Status */}
              {interview && (
                <div className="rounded-lg bg-purple-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-purple-700">
                      📅 Interview: {new Date(interview.scheduled_at).toLocaleDateString()} at{" "}
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

              {/* Click Hint */}
              <div className="flex items-center gap-1 text-xs text-text-secondary group-hover:text-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.5 9a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" clipRule="evenodd" />
                </svg>
                Click to view details & schedule interview
              </div>
            </button>
          );
        })}
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedApplication && (
        <ApplicantDetailDrawer
          application={selectedApplication}
          jobId={jobId}
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          onScheduled={() => router.refresh()}
        />
      )}
    </>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { withdrawApplication } from "./actions";
import { Video, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";

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
  video_room_url?: string | null;
};

const statusConfig: Record<string, { label: string; classes: string; icon?: React.ReactNode }> = {
  applied: { label: "Applied", classes: "bg-blue-50 text-info" },
  shortlisted: { label: "Shortlisted", classes: "bg-yellow-50 text-warning" },
  interview_scheduled: { label: "Interview Scheduled", classes: "bg-purple-50 text-purple-600" },
  interview_passed: { label: "Interview Passed", classes: "bg-green-50 text-success" },
  offer_under_negotiation: { label: "Offer Pending", classes: "bg-orange-50 text-orange-600" },
  offer_interview_scheduled: { label: "JO Interview", classes: "bg-purple-50 text-purple-600" },
  contract_sent: { label: "Contract Sent", classes: "bg-blue-50 text-blue-600" },
  contract_signed: { label: "Contract Signed", classes: "bg-green-50 text-success" },
  offer_rejected: { label: "Offer Rejected", classes: "bg-red-50 text-red-600" },
  onboarded: { label: "Employee", classes: "bg-green-50 text-success" },
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
          const interview = interviewMap[app.id];
          const isInterviewScheduled = app.status === "interview_scheduled" || app.status === "interviewed";
          const isJOInterview = app.status === "offer_interview_scheduled";
          const isOfferPending = app.status === "offer_under_negotiation";
          const isContractSent = app.status === "contract_sent";
          const isContractSigned = app.status === "contract_signed";
          const hasInterviewLink = interview?.video_room_url || interview?.interview_type === "in_person";

          return (
            <div
              key={app.id}
              className="rounded-2xl bg-surface border border-border p-4 space-y-3 transition-all"
            >
              {/* Main Header */}
              <Link href={`/applications/${app.id}`} className="block group">
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
              </Link>

              {/* Interview Details with Join Button */}
              {isInterviewScheduled && interview && (
                <div className="rounded-xl bg-purple-50 p-3 space-y-2 border border-purple-200">
                  <p className="text-xs font-medium text-purple-700 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Interview:{" "}
                    {new Date(interview.scheduled_at).toLocaleString()}
                  </p>
                  {interview.interviewer_notes && (
                    <p className="text-xs text-purple-600">
                      {interview.interviewer_notes}
                    </p>
                  )}
                  {interview.video_room_url && (
                    <a
                      href={interview.video_room_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition mt-2"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Join Interview
                    </a>
                  )}
                </div>
              )}

              {/* Job Offer Review */}
              {isOfferPending && (
                <div className="rounded-xl bg-orange-50 p-3 space-y-2 border border-orange-200">
                  <p className="text-xs font-medium text-orange-700 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Job Offer Pending Your Review
                  </p>
                  <Link
                    href={`/applications/${app.id}/job-offer/review`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Review Offer
                  </Link>
                </div>
              )}

              {/* Job Offer Interview */}
              {isJOInterview && interview && (
                <div className="rounded-xl bg-indigo-50 p-3 space-y-2 border border-indigo-200">
                  <p className="text-xs font-medium text-indigo-700 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Job Offer Interview:{" "}
                    {new Date(interview.scheduled_at).toLocaleString()}
                  </p>
                  {interview.video_room_url && (
                    <a
                      href={interview.video_room_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-lg transition"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Join JO Interview
                    </a>
                  )}
                </div>
              )}

              {/* Contract Sent */}
              {isContractSent && (
                <div className="rounded-xl bg-blue-50 p-3 space-y-2 border border-blue-200">
                  <p className="text-xs font-medium text-blue-700 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Employment Contract Ready for Signature
                  </p>
                  <Link
                    href={`/applications/${app.id}/contract/sign`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Review & Sign Contract
                  </Link>
                </div>
              )}

              {/* Contract Signed - Onboarding Pending */}
              {isContractSigned && (
                <div className="rounded-xl bg-green-50 p-3 space-y-2 border border-green-200">
                  <p className="text-xs font-medium text-green-700 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Contract Signed! Awaiting HR Confirmation...
                  </p>
                </div>
              )}

              {/* Footer - Applied Date & Withdraw */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  Applied {new Date(app.submitted_at).toLocaleDateString()}
                </p>

                {(app.status === "submitted" ||
                  app.status === "under_review" ||
                  app.status === "applied") && (
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
"use client";

import Link from "next/link";
import { useState } from "react";
import { WithdrawModal } from "./WithdrawModal";

export interface ApplicationTrackerCardData {
  id: string;
  status: string;
  matchScore: number | null;
  submittedAt: string;
  rejectionReason?: string | null;
  documentsUrl?: string | null;
  documentsOpenCount?: number;
  interview?: {
    id: string;
    scheduled_at?: string | null;
    duration_minutes?: number | null;
    status: string;
    room_name?: string | null;
  } | null;
  job: {
    title: string;
    department?: string | null;
    workMode?: string | null;
    locationName?: string | null;
    companyName?: string | null;
  };
}

interface ApplicationTrackerCardProps {
  application: ApplicationTrackerCardData;
}

// Stage Pipeline mapping
const STAGE_PIPELINE = [
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer & Contract" },
  { key: "hired", label: "Hired" },
];

/**
 * Maps raw backend status strings to normalized pipeline steps
 */
function getNormalizedStageIndex(status: string): number {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case "applied":
    case "submitted":
    case "draft":
      return 0;
    case "screening":
    case "under_review":
    case "shortlisted":
      return 1;
    case "interview":
    case "interview_scheduled":
    case "interviewed":
      return 2;
    case "offer":
    case "offer_sent":
    case "offer_accepted":
    case "negotiating":
    case "pre_employment":
      return 3;
    case "hired":
    case "hire_confirmed":
      return 4;
    default:
      return 0;
  }
}

export function ApplicationTrackerCard({ application }: ApplicationTrackerCardProps) {
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const normalizedStatus = application.status.toLowerCase();
  const isRejected = normalizedStatus === "rejected";
  const isWithdrawn = normalizedStatus === "withdrawn";
  const isTerminal = isRejected || isWithdrawn;

  const currentStageIndex = getNormalizedStageIndex(application.status);
  const scheduledInterview = application.interview?.status === "scheduled" ? application.interview : null;
  const scheduledStart = scheduledInterview?.scheduled_at ? new Date(scheduledInterview.scheduled_at) : null;
  const scheduledEnd = scheduledStart
    ? new Date(scheduledStart.getTime() + (scheduledInterview?.duration_minutes ?? 45) * 60_000)
    : null;

  // Formatting date
  const formattedDate = new Date(application.submittedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const matchScoreClasses =
    application.matchScore === null
      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      : application.matchScore >= 70
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
        : application.matchScore >= 40
          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  // Work setup badge colors
  const getWorkModeBadge = (mode?: string | null) => {
    if (!mode) return null;
    const m = mode.toLowerCase();
    let badgeStyle = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (m === "remote" || m === "wfh") {
      badgeStyle = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400";
    } else if (m === "hybrid") {
      badgeStyle = "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400";
    } else if (m === "onsite") {
      badgeStyle = "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300";
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badgeStyle}`}>
        {mode}
      </span>
    );
  };

  return (
    <>
      <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md space-y-5 flex flex-col">
        {/* Header: Title, Department, Company, Setup, Applied Date */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {application.job.title}
              </h3>
              {getWorkModeBadge(application.job.workMode)}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {application.job.department && (
                <span>{application.job.department}</span>
              )}
              {application.job.department && application.job.locationName && <span>•</span>}
              {application.job.locationName && (
                <span>{application.job.locationName}</span>
              )}
              {application.job.companyName && (
                <>
                  <span>•</span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    {application.job.companyName}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-slate-400 dark:text-slate-500">
            <span>Applied {formattedDate}</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${matchScoreClasses}`}>
              {application.matchScore === null ? "Not scored yet" : `${Math.round(application.matchScore)}% match`}
            </span>
          </div>
        </div>

        {/* Stage Pipeline Line vs Terminal Alerts */}
        {!isTerminal ? (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Application Progress
            </div>
            {/* Visual Pipeline Bar */}
            <div className="relative py-2">
              <div className="grid grid-cols-5 gap-1 text-center">
                {STAGE_PIPELINE.map((stage, idx) => {
                  const isCompleted = idx < currentStageIndex;
                  const isCurrent = idx === currentStageIndex;

                  return (
                    <div key={stage.key} className="flex flex-col items-center space-y-1.5 min-w-0">
                      {/* Step Indicator */}
                      <div className="relative flex w-full items-center justify-center">
                        {/* Connecting Line */}
                        {idx < STAGE_PIPELINE.length - 1 && (
                          <div
                            className={`absolute left-1/2 right-0 top-1/2 -z-10 h-0.5 -translate-y-1/2 ${
                              idx < currentStageIndex
                                ? "bg-purple-600 dark:bg-purple-500"
                                : "bg-slate-200 dark:bg-slate-800"
                            }`}
                          />
                        )}

                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                            isCompleted
                              ? "bg-purple-600 text-white dark:bg-purple-500"
                              : isCurrent
                              ? "bg-purple-600 text-white ring-4 ring-purple-100 dark:bg-purple-500 dark:ring-purple-950/60"
                              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            idx + 1
                          )}
                        </div>
                      </div>

                      {/* Step Label */}
                      <span
                        className={`text-[11px] leading-tight font-medium truncate w-full ${
                          isCurrent
                            ? "text-purple-600 font-semibold dark:text-purple-400"
                            : isCompleted
                            ? "text-slate-700 dark:text-slate-300"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-1">
            {isRejected && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Application Not Selected</span>
                </div>
                {application.rejectionReason ? (
                  <p className="pl-6 text-slate-600 dark:text-slate-400">
                    Reason: {application.rejectionReason}
                  </p>
                ) : (
                  <p className="pl-6 text-slate-600 dark:text-slate-400">
                    Thank you for applying. The hiring team has decided to proceed with other candidates.
                  </p>
                )}
              </div>
            )}

            {isWithdrawn && (
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <div className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-400">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span>Withdrawn</span>
                </div>
                <p className="pl-6 mt-1 text-slate-500 dark:text-slate-400">
                  You have withdrawn your application for this position.
                </p>
              </div>
            )}
          </div>
        )}

        {scheduledInterview && scheduledStart && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Upcoming interview</p>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {scheduledStart.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {scheduledStart.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                  {scheduledEnd && ` - ${scheduledEnd.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`}
                </p>
              </div>
              <Link
                href={`/applicant/interviews/${scheduledInterview.id}/room`}
                className="inline-flex items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-800"
              >
                Join Interview Call
              </Link>
            </div>
          </div>
        )}

        {application.documentsUrl && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Pre-hire documents requested</p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{application.documentsOpenCount ?? 0} document{application.documentsOpenCount === 1 ? "" : "s"} pending.</p>
            <Link href={application.documentsUrl} className="mt-3 inline-flex rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">Open documents</Link>
          </div>
        )}

        {/* Footer Actions */}
        {!isTerminal && (
          <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsWithdrawOpen(true)}
              className="text-xs font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors py-1 px-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Withdraw Application
            </button>
          </div>
        )}
      </div>

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        applicationId={application.id}
        jobTitle={application.job.title}
      />
    </>
  );
}

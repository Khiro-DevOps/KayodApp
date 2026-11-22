"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WithdrawModal } from "./WithdrawModal";
import { getDisplayMatchScore } from "@/lib/match-scoring";
import { MatchScorePill } from "@/components/ui/match-score-pill";


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

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status.toLowerCase()) {
    case "rejected":
    case "offer_declined":
      return { label: status.toLowerCase() === "offer_declined" ? "Offer Declined" : "Not Selected", className: "border-rose-200/80 bg-rose-50 text-rose-700" };
    case "withdrawn":
      return { label: "Withdrawn", className: "border-rose-200/80 bg-rose-50 text-rose-700" };
    case "hired":
    case "hire_confirmed":
      return { label: "Hired", className: "border-emerald-200/80 bg-emerald-50 text-emerald-700" };
    case "offer":
    case "offer_sent":
    case "offer_accepted":
    case "negotiating":
    case "pre_employment":
      return { label: "Offer & Contract", className: "border-emerald-200/80 bg-emerald-50 text-emerald-700" };
    case "interview":
    case "interview_scheduled":
    case "interviewed":
      return { label: "Interview", className: "border-indigo-200/80 bg-indigo-50 text-indigo-700" };
    case "screening":
    case "under_review":
    case "shortlisted":
      return { label: "Screening", className: "border-indigo-200/80 bg-indigo-50 text-indigo-700" };
    default:
      return { label: "Applied", className: "border-slate-200/80 bg-slate-100 text-slate-700" };
  }
}

export function ApplicationTrackerCard({ application }: ApplicationTrackerCardProps) {
  const router = useRouter();
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const normalizedStatus = application.status.toLowerCase();
  const isTerminal = normalizedStatus === "rejected" || normalizedStatus === "withdrawn";
  const statusBadge = getStatusBadge(application.status);

  const formattedDate = new Date(application.submittedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const displayScore = getDisplayMatchScore({
    applied: true,
    stored: application.matchScore,
  });

  const getWorkModeBadge = (mode?: string | null) => {
    if (!mode) return null;
    const formatted = mode.replace(/[_-]+/g, " ");
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">
        {formatted}
      </span>
    );
  };

  const navigateToDetail = () => {
    router.push(`/applicant/applications/${application.id}`);
  };

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={navigateToDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigateToDetail();
          }
        }}
        className="w-full min-w-0 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-[#1E1B4B]/40 hover:shadow-md transition-all cursor-pointer"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {application.job.title}
              </h3>
              {getWorkModeBadge(application.job.workMode)}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              {application.job.companyName && (
                <span className="font-semibold text-[#1F195E]">
                  {application.job.companyName}
                </span>
              )}
              {application.job.companyName && application.job.locationName && <span>•</span>}
              {application.job.locationName && (
                <span>{application.job.locationName}</span>
              )}
              {(application.job.companyName || application.job.locationName) && (
                <span>•</span>
              )}
              <span>Applied {formattedDate}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {displayScore.value !== null && (
              <MatchScorePill score={displayScore.value} suffix="match" />
            )}
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            {!isTerminal && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWithdrawOpen(true);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors py-1 px-2.5 rounded-lg hover:bg-red-50"
              >
                Withdraw Application
              </button>
            )}
          </div>
        </div>
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

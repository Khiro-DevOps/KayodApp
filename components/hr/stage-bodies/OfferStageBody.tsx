"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOfferSummary } from "@/app/(auth)/actions/offer-actions";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
import HireConfirmationModal from "@/components/hr/HireConfirmationModal";
import {
  CandidateHeaderSection,
  CoverLetterSection,
  MatchBreakdownSection,
  MetadataGridSection,
  ResumePreviewSection,
} from "./shared";

export interface OfferStageBodyProps {
  application: ApplicationHubCard;
  scoreDisplay?: string | null;
  onReject: (applicationId: string) => void;
  onOpenFullApplication: (applicationId: string) => void;
}

function humaniseOfferStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "Unknown";
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getOfferBadgeClass(status: string | null | undefined): string {
  const upper = String(status ?? "").trim().toUpperCase();
  switch (upper) {
    case "ACCEPTED":
    case "SIGNED":
    case "FINALIZED":
    case "HIRED":
    case "HIRE_CONFIRMED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "DECLINED":
      return "bg-red-50 text-red-700 border-red-200";
    case "EXPIRED":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "SENT":
    case "PENDING_SIGNATURE":
      return "bg-primary-light text-primary-dark border-primary/20";
    case "DRAFT":
    case "NEGOTIATING":
    case "NEGOTIATION_PENDING":
    case "REVISED":
    case "PENDING_REVIEW":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

export default function OfferStageBody({
  application,
  scoreDisplay,
  onOpenFullApplication,
}: OfferStageBodyProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<{
    exists: boolean;
    status: string | null;
    applicationStatus: string | null;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const candidateSource = application.candidate ?? application.profiles;
  const rawProfile = Array.isArray(candidateSource)
    ? candidateSource[0]
    : candidateSource;
  const candidateName =
    [rawProfile?.first_name, rawProfile?.last_name].filter(Boolean).join(" ").trim() ||
    "Candidate";
  const jobSource = application.job ?? application.job_postings;
  const rawJob = Array.isArray(jobSource) ? jobSource[0] : jobSource;
  const jobTitle = rawJob?.title?.trim() || "this position";

  const isContractSigned =
    summary?.applicationStatus === "pre_employment" ||
    String(summary?.status ?? "").toUpperCase() === "SIGNED";
  const isHireConfirmed =
    summary?.applicationStatus === "hired" ||
    String(summary?.status ?? "").toUpperCase() === "HIRED";

  useEffect(() => {
    let active = true;
    getOfferSummary(application.id)
      .then((res) => {
        if (!active) return;
        setSummary(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load offer summary");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [application.id]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="offer" scoreDisplay={scoreDisplay} />

        <section className="rounded-xl border border-card-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
              Offer Status
            </h3>
            {!loading && !error && summary?.exists && (
              <div className="flex items-center gap-1.5">
                {isContractSigned && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    Contract signed
                  </span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getOfferBadgeClass(
                    summary.status
                  )}`}
                >
                  {humaniseOfferStatus(summary.status)}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-secondary">Loading offer summary...</p>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : summary?.exists ? (
            <div className="flex flex-col gap-2">
              {(isContractSigned || isHireConfirmed) && (
                <HireConfirmationModal
                  applicationId={application.id}
                  candidateName={candidateName}
                  jobTitle={jobTitle}
                  isConfirmed={isHireConfirmed}
                />
              )}
              <button
                type="button"
                onClick={() => router.push(`/hr/offers/${application.id}`)}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Open offer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/hr/offers/${application.id}`)}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Create offer
            </button>
          )}
        </section>

        <MatchBreakdownSection application={application} stageKey="offer" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>
    </div>
  );
}

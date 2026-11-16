"use client";

import { useRouter } from "next/navigation";
import type { ApplicationHubCard } from "@/app/(dashboard)/hr/applicants/applications-kanban-board";
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

function getOfferStatusMeta(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "offer_accepted":
      return {
        label: "Offer Accepted",
        description: "Candidate accepted the offer. Open the offer flow to review contract and finalize.",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "offer_declined":
      return {
        label: "Offer Declined",
        description: "Candidate declined this offer.",
        badgeClass: "bg-red-50 text-red-700 border-red-200",
      };
    case "offer_expired":
      return {
        label: "Offer Expired",
        description: "Offer validity period has elapsed.",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
    case "negotiating":
      return {
        label: "Negotiating",
        description: "Offer terms are under negotiation.",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      };
    case "pre_employment":
      return {
        label: "Pre-employment",
        description: "Contract signed; pre-employment steps in progress.",
        badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
      };
    case "offer_sent":
      return {
        label: "Offer Sent",
        description: "Contract offer sent and awaiting candidate signature.",
        badgeClass: "bg-primary-light text-primary-dark border-primary/20",
      };
    case "offer":
    default:
      return {
        label: "Pending Offer",
        description: "Ready to prepare or manage the candidate's job offer.",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      };
  }
}

export default function OfferStageBody({
  application,
  scoreDisplay,
  onReject,
  onOpenFullApplication,
}: OfferStageBodyProps) {
  const router = useRouter();
  const offerMeta = getOfferStatusMeta(application.status);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 modern-scrollbar space-y-8">
        <CandidateHeaderSection application={application} stageKey="offer" scoreDisplay={scoreDisplay} />

        <section className="rounded-xl border border-card-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline">
              Offer &amp; Contract Status
            </h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${offerMeta.badgeClass}`}>
              {offerMeta.label}
            </span>
          </div>
          <p className="text-xs text-secondary">{offerMeta.description}</p>
          <button
            type="button"
            onClick={() => router.push(`/hr/offers/${encodeURIComponent(application.id)}`)}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Open Offer &amp; Contract
          </button>
        </section>

        <MatchBreakdownSection application={application} stageKey="offer" scoreDisplay={scoreDisplay} />
        <MetadataGridSection application={application} />
        <ResumePreviewSection application={application} onOpenFullApplication={onOpenFullApplication} />
        <CoverLetterSection application={application} />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-card-border p-6">
        <button
          type="button"
          onClick={() => onReject(application.id)}
          className="rounded-lg border border-error px-4 py-3 text-[13px] font-semibold text-error transition-colors hover:bg-error/10"
        >
          Reject
        </button>

        <button
          type="button"
          onClick={() => router.push(`/hr/offers/${encodeURIComponent(application.id)}`)}
          className="rounded-lg bg-primary px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Manage Offer
        </button>
      </div>
    </div>
  );
}

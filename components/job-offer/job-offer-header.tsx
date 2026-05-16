"use client";

import type { JobOffer, Profile } from "@/lib/types";
import { JOB_OFFER_STATUS_COLORS } from "@/lib/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface Props {
  offer: JobOffer & { applications: any };
  applicant?: Profile | null;
  isHR: boolean;
}

export default function JobOfferHeader({ offer, applicant, isHR }: Props) {
  const application = offer.applications;
  const jobPosting = application?.job_postings;
  const candidateName = applicant 
    ? `${applicant.first_name} ${applicant.last_name}`.trim()
    : "Candidate";

  // Calculate time until expiry
  const expiryDate = new Date(offer.expires_at);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = daysUntilExpiry <= 2 && daysUntilExpiry > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      {/* Top Row: Title & Status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
            {jobPosting?.title || "Job Offer"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            For {candidateName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isExpiringSoon && offer.status !== "expired" && (
            <div className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              ⏰ Expires in {daysUntilExpiry}d
            </div>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${JOB_OFFER_STATUS_COLORS[offer.status]}`}
          >
            {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
            {offer.version > 1 && ` v${offer.version}`}
          </span>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Applicant */}
        <div>
          <p className="text-xs text-text-secondary">Applicant</p>
          <p className="text-sm font-semibold text-text-primary">
            {candidateName}
          </p>
        </div>

        {/* Date Issued */}
        <div>
          <p className="text-xs text-text-secondary">Issued</p>
          <p className="text-sm font-semibold text-text-primary">
            {new Date(offer.issued_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Expires At */}
        <div>
          <p className="text-xs text-text-secondary">Expires</p>
          <p className="text-sm font-semibold text-text-primary">
            {expiryDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Viewed / Accepted */}
        <div>
          <p className="text-xs text-text-secondary">
            {offer.status === "accepted" ? "Signed" : "Status"}
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {offer.accepted_at
              ? new Date(offer.accepted_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : offer.viewed_at
              ? "Viewed"
              : "Pending"}
          </p>
        </div>
      </div>
    </div>
  );
}

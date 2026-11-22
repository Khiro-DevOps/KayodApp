"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Calendar, Clock, DollarSign, FileText, MapPin, User } from "lucide-react";
import { GlassStatTile, PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

export type OfferDirectoryStatus =
  | "Sent"
  | "Negotiating"
  | "Signed"
  | "Hired"
  | "Draft"
  | "Declined";

export type OfferStatusFilter = "All" | OfferDirectoryStatus;

export interface HROfferListItem {
  id: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobCreatedBy?: string | null;
  ownerName?: string | null;
  candidateName: string;
  candidateEmail: string;
  rawOfferStatus: string;
  rawApplicationStatus: string;
  normalizedCategory: OfferDirectoryStatus;
  pendingNegotiationsCount: number;
  totalNegotiationsCount: number;
  salary: number | null;
  currency: string;
  startDate: string | null;
  workSetup: string | null;
  updatedAt: string;
}

export interface HROfferJobOption {
  id: string;
  title: string;
}

interface HROffersListClientProps {
  offers: HROfferListItem[];
  jobOptions: HROfferJobOption[];
  currentUserId?: string;
  initialScope?: "mine" | "all";
}

const STATUS_TABS: OfferStatusFilter[] = [
  "All",
  "Sent",
  "Negotiating",
  "Signed",
  "Hired",
  "Draft",
  "Declined",
];

function getStatusBadgeClasses(status: OfferDirectoryStatus): string {
  switch (status) {
    case "Signed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Hired":
      return "border-green-200 bg-green-100 text-green-800";
    case "Negotiating":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Sent":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Declined":
      return "border-red-200 bg-red-50 text-red-700";
    case "Draft":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null) {
    return "To be confirmed";
  }
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "PHP",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "PHP"} ${amount.toLocaleString()}`;
  }
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "To be confirmed";
  }
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function HROffersListClient({
  offers,
  jobOptions,
  currentUserId,
  initialScope = "mine",
}: HROffersListClientProps) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">(initialScope);
  const [selectedJobId, setSelectedJobId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<OfferStatusFilter>("All");

  function handleScopeChange(nextScope: "mine" | "all") {
    setScope(nextScope);
    router.replace(`/hr/offers?scope=${nextScope}`, { scroll: false });
  }

  const scopeFilteredOffers = useMemo(() => {
    if (scope === "all" || !currentUserId) {
      return offers;
    }
    return offers.filter((offer) => offer.jobCreatedBy === currentUserId);
  }, [offers, scope, currentUserId]);

  const jobFilteredOffers = useMemo(() => {
    if (selectedJobId === "all") {
      return scopeFilteredOffers;
    }
    return scopeFilteredOffers.filter((offer) => offer.jobId === selectedJobId);
  }, [scopeFilteredOffers, selectedJobId]);

  const statusCounts = useMemo(() => {
    const counts: Record<OfferStatusFilter, number> = {
      All: jobFilteredOffers.length,
      Sent: 0,
      Negotiating: 0,
      Signed: 0,
      Hired: 0,
      Draft: 0,
      Declined: 0,
    };
    for (const offer of jobFilteredOffers) {
      counts[offer.normalizedCategory] = (counts[offer.normalizedCategory] ?? 0) + 1;
    }
    return counts;
  }, [jobFilteredOffers]);

  const filteredOffers = useMemo(() => {
    if (selectedStatus === "All") {
      return jobFilteredOffers;
    }
    return jobFilteredOffers.filter((offer) => offer.normalizedCategory === selectedStatus);
  }, [jobFilteredOffers, selectedStatus]);

  return (
    <div className="space-y-6">
      <PageHeroHeader
        eyebrow="Offer Management"
        title="Job Offers"
        subtitle="Track candidate offers, negotiation requests, and signed contracts across job postings."
        actions={
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100/80 bg-white/75 px-3.5 py-2 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
            <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleScopeChange("mine")}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  scope === "mine"
                    ? "bg-[#1E1B4B] text-white"
                    : "text-slate-600 hover:text-[#1E1B4B]"
                }`}
              >
                My Jobs
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange("all")}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  scope === "all"
                    ? "bg-[#1E1B4B] text-white"
                    : "text-slate-600 hover:text-[#1E1B4B]"
                }`}
              >
                All Company
              </button>
            </div>
            <label htmlFor="hr-offers-job-filter" className="text-xs font-semibold text-[#1E1B4B]">
              Job Posting
            </label>
            <select
              id="hr-offers-job-filter"
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              className="rounded-xl border border-indigo-100 bg-white px-3 py-1.5 text-sm font-medium text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none"
            >
              <option value="all">All Job Postings</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <GlassStatTile
          icon={<FileText className="h-5 w-5" />}
          label="Total Offers"
          value={statusCounts.All}
        />
        <GlassStatTile
          icon={<Clock className="h-5 w-5" />}
          label="Sent / Pending"
          value={statusCounts.Sent}
        />
        <GlassStatTile
          icon={<Briefcase className="h-5 w-5" />}
          label="Negotiating"
          value={statusCounts.Negotiating}
        />
        <GlassStatTile
          icon={<DollarSign className="h-5 w-5" />}
          label="Signed & Hired"
          value={statusCounts.Signed + statusCounts.Hired}
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100/80 bg-white/75 p-2 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md"
        role="tablist"
        aria-label="Filter offers by status"
      >
        {STATUS_TABS.map((tab) => {
          const isActive = selectedStatus === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedStatus(tab)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                  : "border-slate-200/80 bg-white text-text-secondary hover:text-[#1E1B4B]"
              }`}
            >
              <span>{tab}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isActive ? "bg-white/20 text-white" : "bg-[#EDE9F9] text-[#1E1B4B]"
                }`}
              >
                {statusCounts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {filteredOffers.length === 0 ? (
        <SolidSurfaceCard className="border-dashed p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-secondary" />
          <h2 className="mt-3 text-base font-semibold text-[#1E1B4B]">No matching job offers</h2>
          <p className="mt-1 text-sm text-text-secondary">
            No offers match the selected job posting and status filter.
          </p>
        </SolidSurfaceCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOffers.map((offer) => (
            <article
              key={offer.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-text-secondary" />
                      <h2 className="truncate text-base font-semibold text-text-primary">
                        {offer.candidateName}
                      </h2>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {offer.candidateEmail || "No email provided"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClasses(
                      offer.normalizedCategory
                    )}`}
                  >
                    {offer.normalizedCategory}
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-background p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-text-primary font-medium">
                    <div className="flex min-w-0 items-center gap-2">
                      <Briefcase className="h-4 w-4 shrink-0 text-text-secondary" />
                      <span className="truncate">{offer.jobTitle}</span>
                    </div>
                    <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-[#1E1B4B]">
                      Owner: {offer.ownerName || "HR Team"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-medium text-text-primary">
                        {formatCurrency(offer.salary, offer.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{formatShortDate(offer.startDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{offer.workSetup || "Remote"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Updated {formatShortDate(offer.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {offer.pendingNegotiationsCount > 0 && (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
                    {offer.pendingNegotiationsCount} pending negotiation request
                    {offer.pendingNegotiationsCount === 1 ? "" : "s"} awaiting HR response
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
                <Link
                  href={`/hr/offers/${encodeURIComponent(offer.applicationId)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-900"
                >
                  <span>Open Offer</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

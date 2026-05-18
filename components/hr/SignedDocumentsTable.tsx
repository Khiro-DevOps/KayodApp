"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type SignedDocumentRow = {
  applicationId: string;
  jobOfferId: string;
  candidateName: string;
  candidateEmail: string;
  candidateAvatarUrl: string | null;
  jobTitle: string;
  signedAt: string;
  applicationStatus: string;
  offerStatus: string;
};

interface SignedDocumentsTableProps {
  documents: SignedDocumentRow[];
}

type FilterKey = "awaiting" | "all";

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function getStatusMeta(applicationStatus: string, offerStatus: string) {
  const normalizedApplicationStatus = normalize(applicationStatus);
  const normalizedOfferStatus = normalize(offerStatus);
  const isConfirmed = normalizedApplicationStatus === "hire_confirmed" || normalizedOfferStatus === "hired";

  if (isConfirmed) {
    return {
      label: "Hired & confirmed",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "Awaiting confirmation",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

export default function SignedDocumentsTable({ documents }: SignedDocumentsTableProps) {
  const [filter, setFilter] = useState<FilterKey>("awaiting");
  const [search, setSearch] = useState("");

  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...documents]
      .filter((document) => {
        const normalizedApplicationStatus = normalize(document.applicationStatus);
        const normalizedOfferStatus = normalize(document.offerStatus);
        const isConfirmed = normalizedApplicationStatus === "hire_confirmed" || normalizedOfferStatus === "hired";

        if (filter === "awaiting" && isConfirmed) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [document.candidateName, document.jobTitle].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => new Date(right.signedAt).getTime() - new Date(left.signedAt).getTime());
  }, [documents, filter, search]);

  const awaitingCount = useMemo(
    () =>
      documents.filter((document) => {
        const normalizedApplicationStatus = normalize(document.applicationStatus);
        const normalizedOfferStatus = normalize(document.offerStatus);
        return normalizedApplicationStatus !== "hire_confirmed" && normalizedOfferStatus !== "hired";
      }).length,
    [documents]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Signed contracts</p>
          <p className="text-xs text-text-secondary">
            Review completed offer letters before confirming hires.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
            {awaitingCount} awaiting confirmation
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {documents.length} total
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          {[
            { key: "awaiting" as const, label: "Awaiting confirmation" },
            { key: "all" as const, label: "All signed" },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-text-primary text-white"
                    : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 md:max-w-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-secondary">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.32 9.87l3.156 3.157a.75.75 0 1 0 1.06-1.06l-3.157-3.157A5.5 5.5 0 0 0 9 3.5ZM4.5 9a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search applicant or job"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
          />
        </label>
      </div>

      {visibleDocuments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-text-primary">No signed documents found</p>
          <p className="mt-1 text-sm text-text-secondary">
            Try a different filter or search term.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">Applicant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">Job title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">Signed date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {visibleDocuments.map((document) => {
                  const statusMeta = getStatusMeta(document.applicationStatus, document.offerStatus);
                  const confirmed = statusMeta.label === "Hired & confirmed";

                  return (
                    <tr key={document.applicationId} className="align-top">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {document.candidateAvatarUrl ? (
                            <img
                              src={document.candidateAvatarUrl}
                              alt={document.candidateName}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {getInitials(document.candidateName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">
                              {document.candidateName}
                            </p>
                            <p className="truncate text-xs text-text-secondary">
                              {document.candidateEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-text-primary">{document.jobTitle}</td>
                      <td className="px-4 py-4 text-sm text-text-secondary">
                        <div>{formatShortDate(document.signedAt)}</div>
                        <div className="text-xs text-text-tertiary">
                          {formatDistanceToNow(new Date(document.signedAt), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {confirmed ? (
                          <span className="inline-flex rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-secondary">
                            Confirmed
                          </span>
                        ) : (
                          <Link
                            href={`/hr/signed-documents/${document.applicationId}`}
                            className="inline-flex rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90"
                          >
                            Review & confirm
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
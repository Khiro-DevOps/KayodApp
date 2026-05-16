"use client";

import type { JobOfferTerms } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface Props {
  terms: JobOfferTerms;
  isExpired?: boolean;
}

export default function JobOfferTermsPanel({ terms, isExpired }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-2xl border ${isExpired ? "border-gray-200 bg-gray-50" : "border-border bg-surface"} p-6 space-y-4`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="text-lg font-bold text-text-primary">Offer Terms</h2>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-text-secondary" />
        ) : (
          <ChevronDown className="h-5 w-5 text-text-secondary" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="space-y-4 border-t border-border pt-4">
          {/* Salary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-text-secondary">Base Salary</p>
              <p className="text-lg font-bold text-text-primary">
                {terms.currency} {terms.salary.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Currency</p>
              <p className="text-sm font-semibold text-text-primary">{terms.currency}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Type</p>
              <p className="text-sm font-semibold text-text-primary capitalize">
                {terms.employmentType.replace("-", " ")}
              </p>
            </div>
          </div>

          <hr className="border-border" />

          {/* Work Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-secondary">Start Date</p>
              <p className="text-sm font-semibold text-text-primary">
                {new Date(terms.startDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Work Arrangement</p>
              <p className="text-sm font-semibold text-text-primary capitalize">
                {terms.workArrangement}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Department</p>
              <p className="text-sm font-semibold text-text-primary">{terms.department}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Direct Manager</p>
              <p className="text-sm font-semibold text-text-primary">{terms.manager}</p>
            </div>
          </div>

          <hr className="border-border" />

          {/* Benefits */}
          <div>
            <p className="mb-3 text-xs font-semibold text-text-secondary uppercase">Benefits</p>
            <div className="space-y-2">
              {terms.benefits && terms.benefits.length > 0 ? (
                terms.benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                    <span className="text-sm text-text-primary">{benefit}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-text-secondary italic">No additional benefits listed.</p>
              )}
            </div>
          </div>

          {/* Additional Notes */}
          {terms.notes && (
            <>
              <hr className="border-border" />
              <div>
                <p className="mb-2 text-xs font-semibold text-text-secondary uppercase">Additional Notes</p>
                <p className="text-sm text-text-primary leading-relaxed">{terms.notes}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

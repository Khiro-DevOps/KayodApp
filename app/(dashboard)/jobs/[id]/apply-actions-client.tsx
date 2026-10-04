"use client";

import { useState } from "react";
import Link from "next/link";

interface ApplyActionsProps {
  jobId: string;
  hasApplied: boolean;
  matchScore: number | null;
}

export default function ApplyActions({
  jobId,
  hasApplied,
  matchScore,
  onApplyClick,
}: ApplyActionsProps & { onApplyClick?: () => void }) {
  const handleApplyClick = () => {
    if (onApplyClick) {
      onApplyClick();
    } else {
      // Fallback behavior if not in modal
      window.location.href = `/applicant/jobs/${jobId}/apply`;
    }
  };

  return (
    <div className="space-y-2">
      {hasApplied ? (
        <div className="rounded-xl border border-border bg-card-bg px-4 py-3 text-center">
          <p className="text-sm font-semibold text-success">✓ Already Applied</p>
          {matchScore !== null && (
            <p className={`text-xs font-bold ${
              matchScore >= 70 ? "text-success" :
              matchScore >= 40 ? "text-warning" :
              "text-text-muted"
            }`}>
              Match Score: {matchScore}%
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={handleApplyClick}
          className="block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Apply Now
        </button>
      )}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import type { JobPosting } from "@/lib/types";
import JobDetailContent from "@/components/jobs/job-detail-content";

interface JobDetailModalProps {
  job: JobPosting | null;
  onClose: () => void;
  applicationsMap: Record<string, { hasApplied: boolean; matchScore: number | null }>;
  estimatedMatchScore?: number | null;
  isCandidate: boolean;
}

export default function JobDetailModal({
  job,
  onClose,
  applicationsMap,
  estimatedMatchScore = null,
  isCandidate,
}: JobDetailModalProps) {
  useEffect(() => {
    if (!job) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    // Lock body scroll when modal is open
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [job, onClose]);

  if (!job) return null;

  const appState = applicationsMap[job.id] || { hasApplied: false, matchScore: null };
  const resolvedScore = appState.matchScore ?? estimatedMatchScore ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl max-h-[80dvh] flex flex-col overflow-hidden bg-white border border-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <JobDetailContent
          job={job}
          hasApplied={appState.hasApplied}
          matchScore={resolvedScore}
          isCandidate={isCandidate}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

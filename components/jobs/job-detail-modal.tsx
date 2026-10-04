"use client";

import { useEffect, useState } from "react";
import type { JobPosting } from "@/lib/types";
import JobDetailContent from "@/components/jobs/job-detail-content";

interface JobDetailModalProps {
  job: JobPosting | null;
  onClose: () => void;
  applicationsMap: Record<string, { hasApplied: boolean; matchScore: number | null }>;
  isCandidate: boolean;
}

export default function JobDetailModal({
  job,
  onClose,
  applicationsMap,
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] my-auto mb-20 md:mb-auto bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden p-0 gap-0 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <JobDetailContent
          job={job}
          hasApplied={appState.hasApplied}
          matchScore={appState.matchScore}
          isCandidate={isCandidate}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

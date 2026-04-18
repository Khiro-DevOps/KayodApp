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
}: ApplyActionsProps) {
  const [showResumePopup, setShowResumePopup] = useState(false);

  const handleApplyClick = async () => {
    // Check if user has resumes
    try {
      const response = await fetch("/api/check-resume");
      const data = await response.json();

      if (data.hasResume) {
        window.location.href = `/jobs/${jobId}/apply`;
      } else {
        setShowResumePopup(true);
      }
    } catch {
      // Silently fail - user may have dismissed upload
      // Fallback to apply page if check fails
      window.location.href = `/jobs/${jobId}/apply`;
    }
  };

  return (
    <div className="space-y-2">
      {hasApplied ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 py-3 text-center space-y-1">
          <p className="text-sm font-medium text-green-700">✓ Already Applied</p>
          {matchScore !== null && (
            <p className={`text-xs font-bold ${
              matchScore >= 70 ? 'text-green-700' :
              matchScore >= 40 ? 'text-yellow-600' :
              'text-text-secondary'
            }`}>
              Match Score: {matchScore}%
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={handleApplyClick}
          className="block w-full rounded-2xl bg-primary py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Apply Now
        </button>
      )}

      {/* Resume Required Popup */}
      {showResumePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">
              Resume Required
            </h3>
            <p className="text-sm text-text-secondary">
              You need to create a resume before applying for jobs. Would you like to create one now?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResumePopup(false)}
                className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
              >
                Cancel
              </button>
              <Link
                href="/resume/create"
                className="flex-1 rounded-xl bg-primary py-2 text-center text-sm font-medium text-white hover:bg-primary-dark"
              >
                Create Resume
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";

import React, { useState, useTransition } from "react";
import { submitScorecard, ScorecardPayload } from "@/app/actions/interviews";

interface ScorecardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  existingScorecard?: ScorecardPayload | null;
}

export function ScorecardDrawer({
  isOpen,
  onClose,
  interviewId,
  candidateName,
  jobTitle,
  existingScorecard,
}: ScorecardDrawerProps) {
  const [rating, setRating] = useState<number>(existingScorecard?.rating || 5);
  const [strengths, setStrengths] = useState<string>(existingScorecard?.strengths || "");
  const [weaknesses, setWeaknesses] = useState<string>(existingScorecard?.weaknesses || "");
  const [privateNotes, setPrivateNotes] = useState<string>(existingScorecard?.private_notes || "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const res = await submitScorecard(interviewId, {
        rating,
        strengths,
        weaknesses,
        private_notes: privateNotes,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to submit scorecard.");
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Submit Interview Scorecard</h3>
            <p className="text-xs text-slate-500">
              {candidateName} • {jobTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Rating (1 to 5 Stars) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">
              Overall Candidate Rating (1–5 Stars)
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 focus:outline-hidden"
                >
                  <svg
                    className={`h-7 w-7 transition-colors ${
                      star <= rating
                        ? "text-amber-400 fill-amber-400"
                        : "text-slate-300 fill-transparent stroke-current stroke-2"
                    }`}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-slate-700">
                {rating} / 5 Stars
              </span>
            </div>
          </div>

          {/* Strengths */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Key Strengths
            </label>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="Technical competencies, communication, culture fit..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Weaknesses */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Areas for Improvement / Concerns
            </label>
            <textarea
              value={weaknesses}
              onChange={(e) => setWeaknesses(e.target.value)}
              placeholder="Gaps in experience, skill concerns..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Private Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Private HR Notes
            </label>
            <textarea
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Internal recommendation, salary expectations, follow-up items..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Submitting..." : "Submit Scorecard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

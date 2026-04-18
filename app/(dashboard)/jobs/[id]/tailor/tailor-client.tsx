"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Resume, TailoredResume } from "@/lib/types";
import Link from "next/link";

export default function TailorClient({
  jobId,
  resumes,
  existingTailored,
}: {
  jobId: string;
  resumes: Resume[];
  existingTailored: TailoredResume[];
}) {
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailoredResume | null>(null);
  const router = useRouter();

  async function handleTailor() {
    if (!selectedResumeId) {
      setError("Please select a resume");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: selectedResumeId,
          job_listing_id: jobId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to tailor resume");
        return;
      }

      setResult(data.tailored_resume);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Resume Selection */}
      {resumes.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
          <p className="text-sm text-text-secondary">
            No resumes with extracted text found.
          </p>
          <p className="text-xs text-text-secondary">
            Upload a <strong>.txt</strong> resume to use AI tailoring.
          </p>
          <Link
            href="/resume"
            className="inline-block mt-2 text-sm font-medium text-primary hover:underline"
          >
            Upload Resume
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <label className="text-sm font-semibold text-text-primary">
            Select a Resume
          </label>
          <div className="space-y-2">
            {resumes.map((resume) => (
              <div key={resume.id} className="rounded-xl bg-background p-3">
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="resume"
                    value={resume.id}
                    checked={selectedResumeId === resume.id}
                    onChange={(e) => setSelectedResumeId(e.target.value)}
                    className="accent-primary"
                  />
                  <span className="truncate">{resume.title || "Untitled Resume"}</span>
                </label>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}

          <button
            onClick={handleTailor}
            disabled={loading || !selectedResumeId}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Tailoring with AI...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
                </svg>
                Tailor Resume with AI
              </>
            )}
          </button>
        </div>
      )}

      {/* Newly Generated Result */}
      {result && (
        <div className="rounded-2xl bg-surface border-2 border-primary/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-primary">
              <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
            </svg>
            <h3 className="text-sm font-semibold text-primary">AI Tailored Result</h3>
          </div>

          {result.keywords && result.keywords.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Matched Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {result.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Tailored Resume</p>
            <div className="rounded-xl bg-background p-3 text-sm text-text-primary whitespace-pre-wrap max-h-80 overflow-y-auto">
              {result.tailored_text}
            </div>
          </div>
        </div>
      )}

      {/* Previously Tailored Resumes */}
      {existingTailored.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Previous Tailored Resumes ({existingTailored.length})
          </h2>
          {existingTailored.map((tr) => (
            <div
              key={tr.id}
              className="rounded-2xl bg-surface border border-border p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  {new Date(tr.created_at).toLocaleString()}
                </p>
              </div>

              {tr.keywords && tr.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tr.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-background p-3 text-sm text-text-primary whitespace-pre-wrap max-h-40 overflow-y-auto">
                {tr.tailored_text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

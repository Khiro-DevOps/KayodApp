"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Resume } from "@/lib/types";
import Link from "next/link";

interface SubmitResult {
  success: boolean;
  error?: string;
  alreadyApplied?: boolean;
}

function ApplyForm({
  jobId,
  resumes,
  submitAction,
  selectedResumeId,
  onSuccess,
}: {
  jobId: string;
  resumes: Resume[];
  submitAction: (formData: FormData) => Promise<SubmitResult>;
  selectedResumeId?: string;
  onSuccess?: () => void;
}) {
  const searchParams = useSearchParams();
  const initialError = searchParams.get("error");
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Auto-select: prefer the explicit selectedResumeId prop (from the job-detail-content
  // which reads the URL's resume_id param), then fall back to the most recently uploaded
  // resume (index 0, already ordered DESC by created_at).
  const defaultResumeId =
    selectedResumeId && resumes.some((r) => r.id === selectedResumeId)
      ? selectedResumeId
      : resumes[0]?.id ?? "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    try {
      const result = await submitAction(formData);
      if (result.success) {
        setShowSuccessToast(true);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setErrorMsg(result.error || "Failed to submit application");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("An unexpected error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 relative">
      {showSuccessToast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-start gap-3 shadow-md">
          <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0">check_circle</span>
          <div>
            <p className="font-semibold">Application Submitted Successfully!</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Tracks live under <Link href="/applicant/applications" className="underline font-medium hover:text-emerald-900">Applications</Link>.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium">
          {errorMsg}
        </div>
      )}

      {!showSuccessToast && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="job_id" value={jobId} />

          {/* Resume Selection */}
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-text-primary">
                Attach Resume
              </label>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Required
              </span>
            </div>

            {resumes.length === 0 ? (
              <div className="rounded-xl bg-background p-3 text-center">
                <p className="text-xs text-text-secondary mb-2">
                  No resumes uploaded yet
                </p>
                <Link
                  href="/applicant/resume"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Upload a resume first
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {resumes.map((resume) => (
                  <div key={resume.id} className="rounded-xl bg-background p-3">
                    <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                      <input
                        type="radio"
                        name="resume_id"
                        value={resume.id}
                        required
                        defaultChecked={resume.id === defaultResumeId}
                        className="accent-primary"
                      />
                      <span className="truncate">{resume.title || "Untitled Resume"}</span>
                      <span className="ml-auto text-xs text-text-secondary whitespace-nowrap">
                        {new Date(resume.created_at).toLocaleDateString()}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || resumes.length === 0}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Submitting...</span>
              </>
            ) : (
              "Submit Application"
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ApplyFormClient(props: {
  jobId: string;
  resumes: Resume[];
  submitAction: (formData: FormData) => Promise<SubmitResult>;
  selectedResumeId?: string;
  onSuccess?: () => void;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-text-secondary">Loading...</div>}>
      <ApplyForm {...props} />
    </Suspense>
  );
}

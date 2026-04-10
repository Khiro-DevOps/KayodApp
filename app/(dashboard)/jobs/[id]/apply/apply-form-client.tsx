"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Resume } from "@/lib/types";
import Link from "next/link";

function ApplyForm({
  jobId,
  resumes,
  submitAction,
}: {
  jobId: string;
  resumes: Resume[];
  submitAction: (formData: FormData) => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form action={submitAction} className="space-y-4">
        <input type="hidden" name="job_listing_id" value={jobId} />

        {/* Resume Selection */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text-primary">
              Attach Resume
            </label>
            <span className="text-xs text-text-secondary">(Optional)</span>
          </div>

          {resumes.length === 0 ? (
            <div className="rounded-xl bg-background p-3 text-center">
              <p className="text-xs text-text-secondary mb-2">
                No resumes uploaded yet
              </p>
              <Link
                href="/resume"
                className="text-xs font-medium text-primary hover:underline"
              >
                Upload a resume first
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl bg-background p-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="radio"
                    name="resume_id"
                    value=""
                    defaultChecked
                    className="accent-primary"
                  />
                  No resume
                </label>
              </div>
              {resumes.map((resume) => (
                <div key={resume.id} className="rounded-xl bg-background p-3">
                  <label className="flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="radio"
                      name="resume_id"
                      value={resume.id}
                      className="accent-primary"
                    />
                    <span className="truncate">{resume.file_name}</span>
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
          className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Submit Application
        </button>
      </form>
    </div>
  );
}

export default function ApplyFormClient(props: {
  jobId: string;
  resumes: Resume[];
  submitAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-text-secondary">Loading...</div>}>
      <ApplyForm {...props} />
    </Suspense>
  );
}

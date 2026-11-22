"use client";

import { useState } from "react";
import type { Profile, Resume } from "@/lib/types";
import GenerateResumeTrigger from "./generate-resume-trigger";
import ResumeBuilderClient from "./resume-builder-client";

export interface ResumePrefill {
  fullName: string;
  email: string;
  phone: string;
  location: string;
}

interface ResumeBuilderModalProps {
  resumes: Resume[];
  profile: Profile | null;
  prefill?: ResumePrefill;
}

export default function ResumeBuilderModal({ resumes, profile, prefill }: ResumeBuilderModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const resumeCount = resumes.length;
  const isLimitReached = resumeCount >= 3;

  return (
    <>
      <GenerateResumeTrigger onClick={() => setIsOpen(true)} />

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 text-slate-900 sm:p-8">
          <div className="w-full max-w-3xl rounded-xl bg-surface-bg p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-text-primary">Build your resume</h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      isLimitReached
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {resumeCount} / 3 Resumes Used
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  You can store up to 3 resumes at a time. Delete an existing resume to free up a slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-card-bg"
                aria-label="Close resume builder"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <ResumeBuilderClient resumes={resumes} profile={profile} prefill={prefill} />
          </div>
        </div>
      )}
    </>
  );
}

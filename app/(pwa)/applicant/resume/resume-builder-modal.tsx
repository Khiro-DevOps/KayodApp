"use client";

import { useState } from "react";
import type { Profile, Resume } from "@/lib/types";
import GenerateResumeTrigger from "./generate-resume-trigger";
import ResumeBuilderClient from "./resume-builder-client";

interface ResumeBuilderModalProps {
  resumes: Resume[];
  profile: Profile | null;
}

export default function ResumeBuilderModal({ resumes, profile }: ResumeBuilderModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <GenerateResumeTrigger onClick={() => setIsOpen(true)} />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
          <div className="w-full max-w-3xl rounded-xl bg-surface-bg p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Build your resume</h2>
                <p className="mt-1 text-sm text-text-secondary">Add your details to generate a tailored resume.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-card-bg"
                aria-label="Close resume builder"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <ResumeBuilderClient resumes={resumes} profile={profile} />
          </div>
        </div>
      )}
    </>
  );
}

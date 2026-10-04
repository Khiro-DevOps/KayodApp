"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { JobPosting, Resume } from "@/lib/types";
import ApplyActions from "@/app/(dashboard)/jobs/[id]/apply-actions-client";
import ApplyFormClient from "@/app/(dashboard)/jobs/[id]/apply/apply-form-client";
import { submitApplication } from "@/app/(dashboard)/hr/applicants/actions";
import { createClient } from "@/lib/supabase/client";

interface JobDetailContentProps {
  job: JobPosting;
  hasApplied: boolean;
  matchScore: number | null;
  isCandidate: boolean;
  onClose?: () => void;
}

export default function JobDetailContent({
  job,
  hasApplied: initialHasApplied,
  matchScore,
  isCandidate,
  onClose,
}: JobDetailContentProps) {
  const [view, setView] = useState<"details" | "resume_required" | "apply_form">("details");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [hasApplied, setHasApplied] = useState(initialHasApplied);

  const searchParams = useSearchParams();
  const urlResumeId = searchParams.get("resume_id") ?? undefined;

  const deptName = (job.departments as unknown as { name: string } | null)?.name ?? "General";

  const handleApplyClick = async () => {
    setIsLoadingResumes(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = "/login";
        return;
      }
      
      const { data } = await supabase
        .from("resumes")
        .select("*")
        .eq("candidate_id", user.id)
        .order("created_at", { ascending: false });
        
      if (data && data.length > 0) {
        setResumes(data as Resume[]);
        setView("apply_form");
      } else {
        setView("resume_required");
      }
    } catch (err) {
      console.error("Error fetching resumes", err);
      // Fallback
      window.location.href = `/applicant/jobs/${job.id}/apply`;
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const handleBackToDetails = () => setView("details");

  const handleApplicationSuccess = () => {
    setHasApplied(true);
  };

  if (view === "resume_required") {
    return (
      <div className="flex flex-col h-full max-h-[85vh] md:max-h-[90vh]">
        <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBackToDetails}
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main"
              aria-label="Back to details"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-text-main truncate">Resume Required</h1>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="rounded-xl border border-border bg-card-bg p-6">
            <p className="w-full text-sm leading-6 text-text-muted mb-6">
              You need to create a resume before applying for jobs. Would you like to create one now?
            </p>
            <div className="flex w-full gap-3 pt-2">
              <button
                onClick={handleBackToDetails}
                className="flex-1 rounded-xl border border-border bg-card-bg px-3 py-2.5 text-sm font-medium text-text-main transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <Link
                href="/applicant/resume/create"
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Create Resume
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "apply_form") {
    return (
      <div className="flex flex-col h-full max-h-[85vh] md:max-h-[90vh]">
        <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBackToDetails}
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main"
              aria-label="Back to details"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-text-main truncate">Apply for {job.title}</h1>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="rounded-xl border border-border bg-surface-container-low p-4 mb-4">
            <p className="text-sm font-semibold text-text-main">{job.title}</p>
            {deptName !== "General" && (
              <p className="mt-0.5 text-xs text-text-muted">{deptName}</p>
            )}
            {job.location && (
              <p className="mt-0.5 text-xs text-text-muted">{job.location}</p>
            )}
          </div>
          
          <ApplyFormClient
            jobId={job.id}
            resumes={resumes}
            submitAction={submitApplication}
            selectedResumeId={urlResumeId}
            onSuccess={handleApplicationSuccess}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh] md:max-h-[90vh] relative bg-white">
      {isLoadingResumes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-xs">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </div>
      )}

      {/* Fixed Header with Close Button */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white">
        <div className="min-w-0 flex-1 pr-4">
          <h1 className="truncate text-xl font-bold text-text-main">{job.title}</h1>
          <p className="text-sm text-text-muted">{deptName}</p>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main shrink-0"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        ) : (
          <Link
            href="/applicant/jobs"
            className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {job.location && (
            <span className="flex items-center gap-1 rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs text-text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.291 5.597a15.591 15.591 0 0 0 2.236 2.236l.012.008ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
              </svg>
              {job.location}
              {job.is_remote && " (Remote)"}
            </span>
          )}
          {job.salary_min && job.salary_max && (
            <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs text-text-muted">
              ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
            </span>
          )}
          <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs text-text-muted">
            {job.employment_type.replace("_", " ")}
          </span>
          <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs text-text-muted">
            Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card-bg p-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Description</p>
            <p className="whitespace-pre-wrap text-sm text-text-main">{job.description}</p>
          </div>

          {job.requirements && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Requirements</p>
              <p className="whitespace-pre-wrap text-sm text-text-main">{job.requirements}</p>
            </div>
          )}

          {job.required_skills && job.required_skills.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      {isCandidate && (
        <div className="p-4 border-t bg-card shrink-0 flex items-center justify-between z-10">
          <div className="w-full">
            <ApplyActions
              jobId={job.id}
              hasApplied={hasApplied}
              matchScore={matchScore}
              onApplyClick={handleApplyClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}

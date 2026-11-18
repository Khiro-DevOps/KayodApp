"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { JobPosting } from "@/lib/types";
import type { JobFitAnalysisOutput } from "@/lib/gemini";
import { getDisplayMatchScore } from "@/lib/match-score";
import JobDetailModal from "@/components/jobs/job-detail-modal";

interface ApplicantJobsClientProps {
  recommendedJobs: Array<{ job: JobPosting; fit: JobFitAnalysisOutput }>;
  allJobs: JobPosting[];
  selectedResumeTitle?: string;
  applicationsMap: Record<string, { hasApplied: boolean; matchScore: number | null }>;
  isCandidate: boolean;
}

function formatSalaryRange(job: JobPosting): string | null {
  const minValue = typeof job.salary_min === "number" ? job.salary_min : null;
  const maxValue = typeof job.salary_max === "number" ? job.salary_max : null;

  if (minValue === null && maxValue === null) return null;
  if (minValue !== null && maxValue !== null) {
    return `₱${minValue.toLocaleString()} - ₱${maxValue.toLocaleString()}`;
  }
  if (minValue !== null) {
    return `From ₱${minValue.toLocaleString()}`;
  }
  return `Up to ₱${maxValue?.toLocaleString()}`;
}

function formatWorkSetup(workSetup: JobPosting["work_setup"]): string {
  if (workSetup === "remote" || workSetup === "wfh") return "Remote / WFH";
  if (workSetup === "hybrid") return "Hybrid";
  return "Onsite";
}

function formatEmploymentType(employmentType: JobPosting["employment_type"]): string {
  return employmentType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMonogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) || "KY").toUpperCase();
}

function formatPostedRelative(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1d ago";
  if (days < 7) return `Posted ${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `Posted ${weeks}w ago`;
  return `Posted ${new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function ApplicantJobsClient({
  recommendedJobs,
  allJobs,
  selectedResumeTitle,
  applicationsMap,
  isCandidate,
}: ApplicantJobsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);

  const allJobsMap = new Map<string, JobPosting>();
  allJobs.forEach((j) => allJobsMap.set(j.id, j));
  recommendedJobs.forEach(({ job }) => allJobsMap.set(job.id, job));

  useEffect(() => {
    const jobIdParam = searchParams.get("jobId");
    if (jobIdParam && allJobsMap.has(jobIdParam)) {
      setSelectedJob(allJobsMap.get(jobIdParam) || null);
    } else {
      setSelectedJob(null);
    }
  }, [searchParams]);

  const openJobModal = (job: JobPosting) => {
    setSelectedJob(job);
    const params = new URLSearchParams(window.location.search);
    params.set("jobId", job.id);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const closeJobModal = () => {
    setSelectedJob(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("jobId");
    const newSearch = params.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    window.history.pushState(null, "", newUrl);
  };

  return (
    <>
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-headline-sm font-headline-sm text-on-surface">Jobs For You</h2>
            <p className="text-body-sm text-on-surface-variant">Based on {selectedResumeTitle ?? "your experience"}</p>
          </div>
          {selectedResumeTitle && (
            <div className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-caps font-label-caps flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Selected resume
            </div>
          )}
        </div>

        {recommendedJobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommendedJobs.map(({ job, fit }) => {
              const dept = job.departments as unknown as { name: string } | null;
              const companyOrDept = dept?.name ?? "Kayod Partner";
              const subtitle = [companyOrDept, job.location].filter(Boolean).join(" • ");
              const salaryRange = formatSalaryRange(job);
              const appliedInfo = applicationsMap[job.id];
              const displayScore = getDisplayMatchScore({
                applied: Boolean(appliedInfo?.hasApplied),
                stored: appliedInfo?.matchScore ?? null,
                estimate: fit.is_fallback ? null : fit.fit_score,
              });
              const badgeLabel =
                displayScore.value === null
                  ? "Recommended"
                  : displayScore.kind === "estimate"
                    ? `${displayScore.value}% Match`
                    : `${displayScore.value}% Match`;
              return (
                <article
                  key={job.id}
                  onClick={() => openJobModal(job)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 font-bold flex items-center justify-center shrink-0 text-sm border border-purple-100">
                          {getMonogram(companyOrDept)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                            {job.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-600 truncate">
                            {subtitle}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                        {badgeLabel}
                      </span>
                    </div>

                    {/* Middle Row */}
                    <div className="flex flex-wrap gap-2">
                      {salaryRange ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {salaryRange}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {formatWorkSetup(job.work_setup)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {formatEmploymentType(job.employment_type)}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-sm text-slate-600">
                      {fit.top_reasons[0] || job.description}
                    </p>
                  </div>

                  {/* Bottom Row */}
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">{formatPostedRelative(job.created_at)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openJobModal(job);
                      }}
                      className="rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                    >
                      {appliedInfo?.hasApplied ? "View Details" : "Quick Apply"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white">
            <p className="text-sm text-slate-600">No recommended jobs matching your criteria.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">All Jobs</h2>
          <span className="rounded-full bg-purple-50 border border-purple-200 text-purple-700 px-3 py-0.5 text-xs font-semibold">
            {allJobs.length} openings
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {allJobs.map((job) => {
            const dept = job.departments as unknown as { name: string } | null;
            const companyOrDept = dept?.name ?? "Kayod Partner";
            const subtitle = [companyOrDept, job.location].filter(Boolean).join(" • ");
            const salaryRange = formatSalaryRange(job);
            const appliedInfo = applicationsMap[job.id];
            return (
              <article
                key={job.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group flex flex-col justify-between gap-4"
                onClick={() => openJobModal(job)}
              >
                <div className="space-y-3">
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 font-bold flex items-center justify-center shrink-0 text-sm border border-purple-100">
                        {getMonogram(companyOrDept)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                          {job.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 truncate">
                          {subtitle}
                        </p>
                      </div>
                    </div>
                    {appliedInfo?.hasApplied ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                        Applied
                      </span>
                    ) : null}
                  </div>

                  {/* Middle Row */}
                  <div className="flex flex-wrap gap-2">
                    {salaryRange ? (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {salaryRange}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formatWorkSetup(job.work_setup)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formatEmploymentType(job.employment_type)}
                    </span>
                  </div>

                  <p className="line-clamp-2 text-sm text-slate-600">
                    {job.description}
                  </p>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">{formatPostedRelative(job.created_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openJobModal(job);
                    }}
                    className="rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-600 hover:text-white transition-colors"
                  >
                    {appliedInfo?.hasApplied ? "View Details" : "View Details"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <JobDetailModal
        job={selectedJob}
        onClose={closeJobModal}
        applicationsMap={applicationsMap}
        isCandidate={isCandidate}
      />
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, Building2, Laptop, Sparkles, Wallet } from "lucide-react";
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

function getWorkSetupPillClass(workSetup: JobPosting["work_setup"]): string {
  if (workSetup === "remote" || workSetup === "wfh") {
    return "border-sky-200/80 bg-sky-50/80 text-sky-700";
  }
  if (workSetup === "hybrid") {
    return "border-indigo-200/80 bg-indigo-50/80 text-indigo-700";
  }
  return "border-amber-200/80 bg-amber-50/80 text-amber-700";
}

function formatEmploymentType(employmentType: JobPosting["employment_type"]): string {
  return String(employmentType ?? "")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveCompanyName(job: JobPosting): string {
  if (job.companyName && job.companyName.trim()) {
    return job.companyName.trim();
  }
  const tenantRel = Array.isArray(job.tenant) ? job.tenant[0] : job.tenant;
  if (tenantRel?.name && tenantRel.name.trim()) {
    return tenantRel.name.trim();
  }
  return "Company";
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-xs font-semibold text-slate-600">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
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

const JOBS_FOR_YOU_PAGE_SIZE = 5;
const ALL_JOBS_PAGE_SIZE = 10;

export default function ApplicantJobsClient({
  recommendedJobs,
  allJobs,
  selectedResumeTitle,
  applicationsMap,
  isCandidate,
}: ApplicantJobsClientProps) {
  const searchParams = useSearchParams();
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [jobsForYouPage, setJobsForYouPage] = useState(1);
  const [allJobsPage, setAllJobsPage] = useState(1);

  const sortedRecommendedJobs = useMemo(() => {
    return [...recommendedJobs].sort((a, b) => {
      const aInfo = applicationsMap[a.job.id];
      const bInfo = applicationsMap[b.job.id];
      const aScore =
        getDisplayMatchScore({
          applied: Boolean(aInfo?.hasApplied),
          stored: aInfo?.matchScore ?? null,
          estimate: a.fit.is_fallback ? null : a.fit.fit_score,
        }).value ?? -1;
      const bScore =
        getDisplayMatchScore({
          applied: Boolean(bInfo?.hasApplied),
          stored: bInfo?.matchScore ?? null,
          estimate: b.fit.is_fallback ? null : b.fit.fit_score,
        }).value ?? -1;
      return bScore - aScore;
    });
  }, [recommendedJobs, applicationsMap]);

  const jobsForYouTotalPages = Math.max(1, Math.ceil(sortedRecommendedJobs.length / JOBS_FOR_YOU_PAGE_SIZE));
  const safeJobsForYouPage = Math.min(jobsForYouPage, jobsForYouTotalPages);
  const pagedRecommendedJobs = sortedRecommendedJobs.slice(
    (safeJobsForYouPage - 1) * JOBS_FOR_YOU_PAGE_SIZE,
    safeJobsForYouPage * JOBS_FOR_YOU_PAGE_SIZE,
  );

  const allJobsTotalPages = Math.max(1, Math.ceil(allJobs.length / ALL_JOBS_PAGE_SIZE));
  const safeAllJobsPage = Math.min(allJobsPage, allJobsTotalPages);
  const pagedAllJobs = allJobs.slice(
    (safeAllJobsPage - 1) * ALL_JOBS_PAGE_SIZE,
    safeAllJobsPage * ALL_JOBS_PAGE_SIZE,
  );

  const estimatedScoresMap = useMemo(() => {
    const map = new Map<string, number | null>();
    recommendedJobs.forEach(({ job, fit }) => {
      map.set(job.id, fit.is_fallback ? null : fit.fit_score);
    });
    return map;
  }, [recommendedJobs]);

  const allJobsMap = useMemo(() => {
    const map = new Map<string, JobPosting>();
    allJobs.forEach((j) => map.set(j.id, j));
    recommendedJobs.forEach(({ job }) => map.set(job.id, job));
    return map;
  }, [allJobs, recommendedJobs]);

  useEffect(() => {
    const jobIdParam = searchParams.get("jobId");
    if (jobIdParam && allJobsMap.has(jobIdParam)) {
      setSelectedJob(allJobsMap.get(jobIdParam) || null);
    } else {
      setSelectedJob(null);
    }
  }, [searchParams, allJobsMap]);

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
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                Jobs For You
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E0D9FC] bg-[#F0ECFF] px-2.5 py-0.5 text-xs font-semibold text-[#1F195E]">
                <Sparkles className="h-3.5 w-3.5" />
                Top Matches
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              Ranked by match score using {selectedResumeTitle ?? "your selected resume"}
            </p>
          </div>
          {selectedResumeTitle ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D9FC] bg-[#F0ECFF] px-3 py-1 text-xs font-semibold text-[#1F195E]">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <span className="max-w-[180px] truncate">{selectedResumeTitle}</span>
            </div>
          ) : null}
        </div>

        {sortedRecommendedJobs.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pagedRecommendedJobs.map(({ job, fit }) => {
                const companyName = resolveCompanyName(job);
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
                    : `${displayScore.value}% Match`;
                return (
                  <article
                    key={job.id}
                    onClick={() => openJobModal(job)}
                    className="rounded-2xl border border-[#E8E4F8] bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(31,25,94,0.04)] hover:border-[#1F195E]/35 hover:shadow-[0_8px_24px_rgba(31,25,94,0.08)] transition-all cursor-pointer group flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#1F195E] transition-colors truncate">
                            {job.title}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 truncate">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1F195E]" />
                            <span className="truncate font-medium text-slate-700">{companyName}</span>
                            {job.location ? <span className="truncate text-slate-500">• {job.location}</span> : null}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold">
                          {badgeLabel}
                        </span>
                      </div>

                      {/* Middle Row */}
                      <div className="flex flex-wrap gap-2">
                        {salaryRange ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <Wallet className="h-3.5 w-3.5 shrink-0" />
                            {salaryRange}
                          </span>
                        ) : null}
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkSetupPillClass(job.work_setup)}`}>
                          <Laptop className="h-3.5 w-3.5 shrink-0" />
                          {formatWorkSetup(job.work_setup)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D9FC] bg-[#F4F1FF] px-2.5 py-1 text-xs font-semibold text-[#1F195E]">
                          <Briefcase className="h-3.5 w-3.5 shrink-0" />
                          {formatEmploymentType(job.employment_type)}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-sm text-slate-600">
                        {fit.top_reasons[0] || job.description}
                      </p>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex items-center justify-between gap-3 border-t border-[#F0ECFF] pt-3">
                      <span className="text-xs text-slate-500">{formatPostedRelative(job.created_at)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openJobModal(job);
                        }}
                        className="rounded-lg bg-[#1F195E] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2a2376] transition-colors"
                      >
                        {appliedInfo?.hasApplied ? "View Details" : "Quick Apply"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <PaginationControls
              currentPage={safeJobsForYouPage}
              totalPages={jobsForYouTotalPages}
              onPageChange={setJobsForYouPage}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white">
            <p className="text-sm text-slate-600">No recommended jobs matching your criteria.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">All Open Roles</h2>
          <span className="rounded-full bg-[#F0ECFF] border border-[#E0D9FC] text-[#1F195E] px-3 py-0.5 text-xs font-semibold">
            {allJobs.length} openings
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pagedAllJobs.map((job) => {
            const companyName = resolveCompanyName(job);
            const salaryRange = formatSalaryRange(job);
            const appliedInfo = applicationsMap[job.id];
            return (
              <article
                key={job.id}
                className="rounded-2xl border border-[#E8E4F8] bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(31,25,94,0.04)] hover:border-[#1F195E]/35 hover:shadow-[0_8px_24px_rgba(31,25,94,0.08)] transition-all cursor-pointer group flex flex-col justify-between gap-4"
                onClick={() => openJobModal(job)}
              >
                <div className="space-y-3">
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#1F195E] transition-colors truncate">
                        {job.title}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 truncate">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1F195E]" />
                        <span className="truncate font-medium text-slate-700">{companyName}</span>
                        {job.location ? <span className="truncate text-slate-500">• {job.location}</span> : null}
                      </p>
                    </div>
                    {appliedInfo?.hasApplied ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold">
                        Applied
                      </span>
                    ) : null}
                  </div>

                  {/* Middle Row */}
                  <div className="flex flex-wrap gap-2">
                    {salaryRange ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                        {salaryRange}
                      </span>
                    ) : null}
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkSetupPillClass(job.work_setup)}`}>
                      <Laptop className="h-3.5 w-3.5 shrink-0" />
                      {formatWorkSetup(job.work_setup)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D9FC] bg-[#F4F1FF] px-2.5 py-1 text-xs font-semibold text-[#1F195E]">
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      {formatEmploymentType(job.employment_type)}
                    </span>
                  </div>

                  <p className="line-clamp-2 text-sm text-slate-600">
                    {job.description}
                  </p>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between gap-3 border-t border-[#F0ECFF] pt-3">
                  <span className="text-xs text-slate-500">{formatPostedRelative(job.created_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openJobModal(job);
                    }}
                    className="rounded-lg border border-[#E0D9FC] bg-[#F0ECFF] px-3.5 py-1.5 text-xs font-semibold text-[#1F195E] hover:bg-[#1F195E] hover:text-white transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <PaginationControls
          currentPage={safeAllJobsPage}
          totalPages={allJobsTotalPages}
          onPageChange={setAllJobsPage}
        />
      </section>

      <JobDetailModal
        job={selectedJob}
        onClose={closeJobModal}
        applicationsMap={applicationsMap}
        estimatedMatchScore={selectedJob ? (estimatedScoresMap.get(selectedJob.id) ?? null) : null}
        isCandidate={isCandidate}
      />
    </>
  );
}

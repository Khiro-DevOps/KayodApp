"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { JobPosting } from "@/lib/types";
import type { JobFitAnalysisOutput } from "@/lib/gemini";
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recommendedJobs.map(({ job, fit }) => {
              const dept = job.departments as unknown as { name: string } | null;
              const salaryRange = formatSalaryRange(job);
              return (
                <article
                  key={job.id}
                  onClick={() => openJobModal(job)}
                  className="bg-white border border-outline-variant rounded-xl p-6 job-card-hover cursor-pointer group relative"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[32px]">analytics</span>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full text-label-caps font-label-caps"
                      style={{ backgroundColor: `${fit.card_color_hex}18`, color: fit.card_color_hex }}
                    >
                      {(fit as any).is_fallback ? "ANALYSIS PENDING" : `${fit.match_level} ${fit.fit_score}%`}
                    </div>
                  </div>
                  <h3 className="text-title-lg font-title-lg text-on-surface group-hover:text-primary transition-colors">
                    {job.title}
                  </h3>
                  <p className="text-body-sm text-on-surface-variant font-medium mb-3">
                    {dept?.name ?? "General"}{job.job_category && ` • ${job.job_category}`}
                  </p>
                  <p className="w-full min-w-0 block whitespace-normal break-words leading-relaxed text-body-sm text-on-surface-variant mb-6">
                    {fit.top_reasons[0]}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {job.location && (
                      <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-[18px]">location_on</span> {job.location}
                      </div>
                    )}
                    {salaryRange && (
                      <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-[18px]">payments</span> {salaryRange}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
                      <span className="material-symbols-outlined text-[18px]">home_work</span> {formatWorkSetup(job.work_setup)}
                    </div>
                    <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
                      <span className="material-symbols-outlined text-[18px]">schedule</span> {formatEmploymentType(job.employment_type)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-outline-variant p-8 text-center bg-surface">
            <p className="text-body-sm text-on-surface-variant">No recommended jobs matching your criteria.</p>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">All Jobs</h2>
          <span className="bg-surface-container-highest text-primary px-3 py-0.5 rounded-full text-label-caps font-label-caps">
            {allJobs.length} openings
          </span>
        </div>

        <div className="space-y-4">
          {allJobs.map((job) => {
            const salaryRange = formatSalaryRange(job);
            return (
              <div
                key={job.id}
                className="bg-white border border-outline-variant rounded-xl p-6 job-card-hover flex flex-col md:flex-row gap-6 group relative cursor-pointer"
                onClick={() => openJobModal(job)}
              >
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[40px]">monitoring</span>
                  </div>
                </div>
                <div className="flex-grow space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <h3 className="text-title-lg font-title-lg text-on-surface group-hover:text-primary transition-colors">
                      {job.title}
                    </h3>
                    <span className="text-label-caps font-label-caps text-on-surface-variant">
                      Posted {new Date(job.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {job.location && (
                      <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px]">location_on</span> {job.location}
                      </div>
                    )}
                    {salaryRange && (
                      <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px]">payments</span> {salaryRange}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">home_work</span> {formatWorkSetup(job.work_setup)}
                    </div>
                  </div>
                  <p className="w-full min-w-0 block whitespace-normal break-words leading-relaxed text-body-sm text-on-surface-variant">
                    {job.description}
                  </p>
                </div>
                <div className="flex items-center relative z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openJobModal(job);
                    }}
                    className="w-full md:w-auto border border-primary text-primary px-8 py-2 rounded-full font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-all text-center"
                  >
                    View Details
                  </button>
                </div>
              </div>
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

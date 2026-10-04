"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ManageJobPosting = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  employment_type: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  slots: number;
  is_published: boolean;
  created_at: string;
  closes_at: string | null;
  departments?: { name?: string | null } | null;
  applicantCount: number;
  required_skills?: string[] | null;
};

type ManageJobsWorkspaceProps = {
  jobs: ManageJobPosting[];
  companyName: string;
};

function formatEmploymentType(value: string) {
  return value.replace(/_/g, " ");
}

function formatCurrencyRange(job: ManageJobPosting) {
  const hasMin = typeof job.salary_min === "number";
  const hasMax = typeof job.salary_max === "number";

  if (!hasMin && !hasMax) {
    return "Not specified";
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: job.currency || "PHP",
    maximumFractionDigits: 0,
  });

  if (hasMin && hasMax) {
    return `${formatter.format(job.salary_min!)} - ${formatter.format(job.salary_max!)}`;
  }

  if (hasMin) {
    return `From ${formatter.format(job.salary_min!)}`;
  }

  return `Up to ${formatter.format(job.salary_max!)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function matchesSearch(job: ManageJobPosting, query: string) {
  if (!query) return true;

  const haystack = [
    job.title,
    job.location ?? "",
    job.description,
    job.requirements ?? "",
    job.employment_type,
    job.departments?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function ManageJobsWorkspace({ jobs, companyName }: ManageJobsWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [activeJobId, setActiveJobId] = useState(jobs[0]?.id ?? "");

  const normalizedSearch = search.trim().toLowerCase();
  const visibleJobs = jobs.filter((job) => matchesSearch(job, normalizedSearch));

  useEffect(() => {
    if (visibleJobs.length === 0) {
      if (activeJobId !== "") {
        setActiveJobId("");
      }
      return;
    }

    if (!visibleJobs.some((job) => job.id === activeJobId)) {
      setActiveJobId(visibleJobs[0]!.id);
    }
  }, [activeJobId, visibleJobs]);

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card-bg px-6 py-16 shadow-sm">
        <div className="max-w-xl space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary-dark">
            <span className="material-symbols-outlined text-[28px]">work</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {companyName}
            </p>
            <h1 className="text-2xl font-bold text-text-main">
              Manage Jobs
            </h1>
            <p className="text-xs leading-6 text-text-muted">
              No job postings found for this company workspace. Click "New Job" to create your first listing.
            </p>
          </div>
          <Link
            href="/hr/jobs/manage/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover shadow-xs"
          >
            New Job
          </Link>
        </div>
      </div>
    );
  }

  const selectedJob = visibleJobs.find((job) => job.id === activeJobId) ?? visibleJobs[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-text-main">
            Manage Jobs
          </h1>
          <p className="text-xs text-text-muted">
            Scoped to {companyName}
          </p>
        </div>

        <Link
          href="/hr/jobs/manage/new"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover shadow-xs"
        >
          + New Job
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:items-start">
        {/* Left Master List */}
        <aside className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card-bg p-5 shadow-sm">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">
              search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-bg py-2 pl-9 pr-4 text-xs text-text-main outline-none transition-colors placeholder:text-text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Search jobs..."
              type="text"
            />
          </div>

          <div className="space-y-2.5">
            {visibleJobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface-bg p-6 text-center">
                <p className="text-xs font-semibold text-text-main">No matching jobs</p>
                <p className="mt-1 text-xs text-text-muted">
                  Clear the search to view all listings.
                </p>
              </div>
            ) : (
              visibleJobs.map((job) => {
                const departmentName = job.departments?.name?.trim() || "General";
                const isActive = selectedJob?.id === job.id;

                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setActiveJobId(job.id)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-all duration-150 ${
                      isActive
                        ? "border-primary bg-primary-light/30 shadow-xs"
                        : "border-border bg-card-bg hover:border-primary/40 hover:bg-surface-bg"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-semibold text-text-main">{job.title}</p>
                        <p className="text-xs text-text-muted truncate">
                          {departmentName} · {formatEmploymentType(job.employment_type)}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          job.is_published
                            ? "bg-success-bg text-success border border-success/20"
                            : "bg-surface-bg text-text-muted border border-border"
                        }`}
                      >
                        {job.is_published ? "Published" : "Draft"}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-text-muted">
                      <span className="rounded-md bg-surface-bg px-2 py-0.5 border border-border/60">
                        {job.location ?? "Location not set"}
                      </span>
                      <span className="rounded-md bg-surface-bg px-2 py-0.5 border border-border/60">
                        {formatCurrencyRange(job)}
                      </span>
                      <span className="rounded-md bg-surface-bg px-2 py-0.5 border border-border/60 font-medium text-text-main">
                        {job.applicantCount} applicant{job.applicantCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="mt-2.5 text-[10px] text-text-muted uppercase tracking-wider">
                      Posted {formatDate(job.created_at)}
                      {job.closes_at ? ` · Closes ${formatDate(job.closes_at)}` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Detail Section */}
        <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card-bg shadow-sm">
          {selectedJob ? (
            <>
              <div className="border-b border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-dark">
                        {selectedJob.departments?.name?.trim() || "General"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          selectedJob.is_published
                            ? "bg-success-bg text-success border border-success/20"
                            : "bg-surface-bg text-text-muted border border-border"
                        }`}
                      >
                        {selectedJob.is_published ? "Published" : "Draft"}
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-text-main">
                      {selectedJob.title}
                    </h2>
                    <p className="text-xs text-text-muted">
                      Posted {formatDate(selectedJob.created_at)}
                      {selectedJob.closes_at ? ` · Closes ${formatDate(selectedJob.closes_at)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/hr/jobs/manage/${selectedJob.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-main transition-colors hover:bg-surface-bg"
                    >
                      Open Details
                    </Link>
                    <Link
                      href={`/hr/jobs/manage/${selectedJob.id}/edit`}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover shadow-xs"
                    >
                      Edit Job
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-border p-5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                <div className="rounded-lg bg-surface-bg p-3 border border-border/60 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Location
                  </p>
                  <p className="mt-1 text-xs font-semibold text-text-main">
                    {selectedJob.location ?? "Not specified"}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-bg p-3 border border-border/60 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Salary Range
                  </p>
                  <p className="mt-1 text-xs font-semibold text-text-main">
                    {formatCurrencyRange(selectedJob)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-bg p-3 border border-border/60 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Employment Type
                  </p>
                  <p className="mt-1 text-xs font-semibold text-text-main capitalize">
                    {formatEmploymentType(selectedJob.employment_type)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-bg p-3 border border-border/60 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Available Slots
                  </p>
                  <p className="mt-1 text-xs font-semibold text-text-main">
                    {selectedJob.slots}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-5 xl:grid-cols-[1.3fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-bg p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        Job Description
                      </h3>
                      <span className="text-xs font-semibold text-primary">
                        {selectedJob.applicantCount} applicant{selectedJob.applicantCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-text-main">
                      {selectedJob.description}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-surface-bg p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Requirements & Qualifications
                    </h3>
                    <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-text-main">
                      {selectedJob.requirements?.trim() || "No requirements were provided for this listing."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card-bg p-4 shadow-xs">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Quick Summary
                    </h3>
                    <dl className="mt-3 space-y-3 text-xs">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Department
                        </dt>
                        <dd className="mt-0.5 font-semibold text-text-main">
                          {selectedJob.departments?.name?.trim() || "General"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Published
                        </dt>
                        <dd className="mt-0.5 font-semibold text-text-main">
                          {selectedJob.is_published ? "Yes" : "No"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Closing Date
                        </dt>
                        <dd className="mt-0.5 font-semibold text-text-main">
                          {selectedJob.closes_at ? formatDate(selectedJob.closes_at) : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Required Skills
                        </dt>
                        <dd className="mt-1.5 flex flex-wrap gap-1.5">
                          {selectedJob.required_skills?.length ? (
                            selectedJob.required_skills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary-dark"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-text-muted">No skills listed</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-dashed border-border bg-surface-bg p-4">
                    <p className="text-xs font-bold text-text-main">Need to publish a new role?</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      Create new postings scoped to your workspace without leaving the portal.
                    </p>
                    <Link
                      href="/hr/jobs/manage/new"
                      className="mt-3 inline-flex rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover shadow-xs"
                    >
                      + New Job
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
              <div className="max-w-md space-y-2">
                <p className="text-sm font-semibold text-text-main">No job selected</p>
                <p className="text-xs text-text-muted">
                  Pick a job from the left pane to review full details.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
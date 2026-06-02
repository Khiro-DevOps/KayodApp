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
    return `${formatter.format(job.salary_min)} - ${formatter.format(job.salary_max)}`;
  }

  if (hasMin) {
    return `From ${formatter.format(job.salary_min)}`;
  }

  return `Up to ${formatter.format(job.salary_max)}`;
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
      <div className="flex items-center justify-center rounded-3xl border border-card-border bg-[linear-gradient(180deg,#ffffff_0%,#f8f6ff_100%)] px-6 py-10 shadow-sm">
        <div className="max-w-xl space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[28px]">work</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
              {companyName}
            </p>
            <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
              Manage Jobs
            </h1>
            <p className="text-sm leading-6 text-text-secondary">
              No job postings found for this company workspace. Click "New Job" to create your first listing.
            </p>
          </div>
          <Link
            href="/jobs/manage/new"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            New Job
          </Link>
        </div>
      </div>
    );
  }

  const selectedJob = visibleJobs.find((job) => job.id === activeJobId) ?? visibleJobs[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
            Manage Jobs
          </h1>
          <p className="text-sm text-text-secondary">
            Securely scoped to {companyName}.
          </p>
        </div>

        <Link
          href="/jobs/manage/new"
          className="mt-1 inline-flex shrink-0 items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          + New Job
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:gap-4 lg:items-start">
        <aside className="flex min-w-0 flex-col gap-4 rounded-3xl border border-card-border bg-white/90 p-4 shadow-sm modern-scrollbar">
          <div className="group relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-card-border bg-white py-3 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-text-secondary/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Search jobs..."
              type="text"
            />
          </div>

          <div className="space-y-3">
            {visibleJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-card-border bg-surface p-6 text-center">
                <p className="text-sm font-medium text-text-primary">No matching jobs</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Clear the search to view all listings in this workspace.
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
                    className={`w-full rounded-3xl border p-4 text-left transition-all duration-200 ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-[0_10px_30px_rgba(124,122,172,0.16)]"
                        : "border-card-border bg-white hover:border-primary/40 hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{job.title}</p>
                        <p className="text-xs text-text-secondary">
                          {departmentName} · {formatEmploymentType(job.employment_type)}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          job.is_published
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {job.is_published ? "Published" : "Draft"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                      <span className="rounded-full bg-surface px-2.5 py-1">
                        {job.location ?? "Location not set"}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1">
                        {formatCurrencyRange(job)}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1">
                        {job.applicantCount} applicant{job.applicantCount === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1">
                        {job.slots} slot{job.slots === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                      Posted {formatDate(job.created_at)}
                      {job.closes_at ? ` · Closes ${formatDate(job.closes_at)}` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col rounded-3xl border border-card-border bg-white shadow-sm modern-scrollbar">
          {selectedJob ? (
            <>
              <div className="border-b border-card-border px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                        {selectedJob.departments?.name?.trim() || "General"}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          selectedJob.is_published
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {selectedJob.is_published ? "Published" : "Draft"}
                      </span>
                    </div>

                    <h2 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
                      {selectedJob.title}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      Posted {formatDate(selectedJob.created_at)}
                      {selectedJob.closes_at ? ` · Closes ${formatDate(selectedJob.closes_at)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/jobs/manage/${selectedJob.id}`}
                      className="rounded-2xl border border-card-border px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface"
                    >
                      Open Details
                    </Link>
                    <Link
                      href={`/jobs/manage/${selectedJob.id}/edit`}
                      className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      Edit Job
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-card-border px-6 py-5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                <div className="rounded-2xl bg-surface p-4 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                    Location
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
                    {selectedJob.location ?? "Not specified"}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface p-4 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                    Salary Range
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
                    {formatCurrencyRange(selectedJob)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface p-4 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                    Employment Type
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
                    {formatEmploymentType(selectedJob.employment_type)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface p-4 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                    Available Slots
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
                    {selectedJob.slots}
                  </p>
                </div>
              </div>

              <div className="grid gap-5 px-6 py-6 xl:grid-cols-[1.3fr_0.9fr]">
                <div className="space-y-5">
                  <div className="rounded-3xl border border-card-border bg-surface p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
                        Job Description
                      </h3>
                      <span className="text-xs text-text-secondary">
                        {selectedJob.applicantCount} applicant{selectedJob.applicantCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                      {selectedJob.description}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-card-border bg-surface p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      Requirements & Qualifications
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                      {selectedJob.requirements?.trim() || "No requirements were provided for this listing."}
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-3xl border border-card-border bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      Quick Summary
                    </h3>
                    <dl className="mt-4 space-y-4">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
                          Department
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">
                          {selectedJob.departments?.name?.trim() || "General"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
                          Published
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">
                          {selectedJob.is_published ? "Yes" : "No"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
                          Closing Date
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">
                          {selectedJob.closes_at ? formatDate(selectedJob.closes_at) : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
                          Required Skills
                        </dt>
                        <dd className="mt-2 flex flex-wrap gap-2">
                          {selectedJob.required_skills?.length ? (
                            selectedJob.required_skills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-text-secondary">No skills listed</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-3xl border border-dashed border-card-border bg-white p-5">
                    <p className="text-sm font-semibold text-text-primary">Need to publish a new role?</p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      Keep this workspace focused on the active company tenant and create new postings without leaving the page.
                    </p>
                    <Link
                      href="/jobs/manage/new"
                      className="mt-4 inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      New Job
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center px-6 py-10 text-center">
              <div className="max-w-md space-y-3">
                <p className="text-sm font-medium text-text-primary">No job selected</p>
                <p className="text-sm leading-6 text-text-secondary">
                  Pick a job from the left pane to review the full posting details.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
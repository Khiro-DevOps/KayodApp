"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

const PAGE_BATCH_SIZE = 20;

type ManageJobPosting = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  employment_type: string;
  work_setup?: string | null;
  work_location_id?: string | null;
  branch_name?: string | null;
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
  created_by?: string | null;
  ownerName?: string | null;
};

type ManageJobsWorkspaceProps = {
  jobs: ManageJobPosting[];
  companyName: string;
  nextCursor?: string | null;
  currentCursor?: string | null;
};

function formatEmploymentType(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWorkSetup(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === "onsite" || normalized === "on_site" || normalized === "on-site") {
    return "Onsite";
  }
  if (normalized === "hybrid") {
    return "Hybrid";
  }
  if (normalized === "remote" || normalized === "wfh") {
    return "Remote";
  }
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
    return `${formatter.format(job.salary_min!)} – ${formatter.format(job.salary_max!)}`;
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
    job.branch_name ?? "",
    job.description,
    job.requirements ?? "",
    job.employment_type,
    job.departments?.name ?? "",
    ...(job.required_skills ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function ManageJobsWorkspace({
  jobs,
  companyName,
  nextCursor,
  currentCursor,
}: ManageJobsWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [activeJobId, setActiveJobId] = useState(jobs[0]?.id ?? "");
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH_SIZE);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleJobs = useMemo(
    () => jobs.filter((job) => matchesSearch(job, normalizedSearch)),
    [jobs, normalizedSearch]
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setVisibleCount(PAGE_BATCH_SIZE);
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  };

  const paginatedJobs = useMemo(
    () => visibleJobs.slice(0, visibleCount),
    [visibleJobs, visibleCount]
  );
  const hasMore = paginatedJobs.length < visibleJobs.length;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = listContainerRef.current;
    if (!sentinel || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + PAGE_BATCH_SIZE, visibleJobs.length));
        }
      },
      {
        root,
        rootMargin: "80px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, visibleJobs.length]);

  if (jobs.length === 0) {
    return (
      <SolidSurfaceCard className="flex items-center justify-center px-6 py-16 font-sans">
        <div className="max-w-xl space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B]">
            <span className="material-symbols-outlined text-[28px]">work</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {companyName}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Manage Jobs
            </h1>
            <p className="text-sm leading-6 text-text-muted">
              No job postings found for this company workspace. Click &quot;New Job&quot; to create your first listing.
            </p>
          </div>
          <Link
            href="/hr/jobs/new"
            className="inline-flex items-center justify-center rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
          >
            New Job
          </Link>
        </div>
      </SolidSurfaceCard>
    );
  }

  const selectedJob = visibleJobs.find((job) => job.id === activeJobId) ?? visibleJobs[0] ?? null;
  const selectedSkills = (selectedJob?.required_skills ?? []).filter(
    (skill): skill is string => typeof skill === "string" && skill.trim().length > 0
  );

  return (
    <div className="flex flex-col gap-6 font-sans">
      <PageHeroHeader
        eyebrow={companyName}
        title="Manage Jobs"
        subtitle="Create, publish, and manage open roles across your workspace"
        actions={
          <Link
            href="/hr/jobs/new"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
          >
            + New Job
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:items-start">
        {/* Left Master List (Frosted Glass Rail, pinned search + 5-card scrollable window) */}
        <aside className="flex min-w-0 flex-col gap-3.5 rounded-[24px] border border-indigo-100/80 bg-white/80 p-4 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
              search
            </span>
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="w-full rounded-xl border border-indigo-100 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-text-muted/70 focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
              placeholder="Search jobs..."
              type="text"
            />
          </div>

          <div
            ref={listContainerRef}
            className="modern-scrollbar max-h-[690px] space-y-2.5 overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
          >
            {visibleJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <p className="text-sm font-semibold text-slate-900">No matching jobs</p>
                <p className="mt-1 text-xs text-text-muted">
                  Clear the search to view all listings.
                </p>
              </div>
            ) : (
              <>
                {paginatedJobs.map((job) => {
                  const departmentName = job.departments?.name?.trim() || "General";
                  const isActive = selectedJob?.id === job.id;
                  const workSetupLabel = formatWorkSetup(job.work_setup);
                  const locationLabel = job.branch_name || job.location || "Location not set";

                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setActiveJobId(job.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-150 ${
                        isActive
                          ? "border-[#1E1B4B]/40 bg-[#EDE9F9]/55 shadow-xs"
                          : "border-slate-200/80 bg-white hover:border-[#1E1B4B]/25 hover:bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate text-sm font-semibold text-slate-900">{job.title}</p>
                          <p className="truncate text-xs text-text-muted">
                            {departmentName} · {formatEmploymentType(job.employment_type)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            job.is_published
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {job.is_published ? "Published" : "Draft"}
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-text-muted">
                        {workSetupLabel && (
                          <span className="rounded-lg border border-indigo-100 bg-[#EDE9F9]/80 px-2 py-0.5 font-medium text-[#1E1B4B]">
                            {workSetupLabel}
                          </span>
                        )}
                        <span className="rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-0.5">
                          {locationLabel}
                        </span>
                        <span className="rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-0.5">
                          {formatCurrencyRange(job)}
                        </span>
                        <span className="rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-0.5 font-medium text-slate-800">
                          {job.applicantCount} active applicant{job.applicantCount === 1 ? "" : "s"}
                        </span>
                        <span className="rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2 py-0.5 font-semibold text-[#1E1B4B]">
                          Owner: {job.ownerName?.trim() || "HR Team"}
                        </span>
                      </div>

                      <p className="mt-2.5 text-[11px] font-medium text-text-muted">
                        {formatDate(job.created_at)}
                        {job.closes_at ? ` · Closes ${formatDate(job.closes_at)}` : ""}
                      </p>
                    </button>
                  );
                })}

                <div ref={loadMoreRef} className="pt-1 text-center">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-text-muted">
                    <span>
                      Showing {paginatedJobs.length} of {visibleJobs.length} role{visibleJobs.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-3">
                      {currentCursor ? (
                        <Link
                          href="/hr/jobs"
                          className="font-semibold text-slate-700 hover:underline"
                        >
                          Newest Page
                        </Link>
                      ) : null}
                      {hasMore ? (
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCount((prev) => Math.min(prev + PAGE_BATCH_SIZE, visibleJobs.length))
                          }
                          className="font-semibold text-[#1E1B4B] hover:underline"
                        >
                          Load more
                        </button>
                      ) : nextCursor ? (
                        <Link
                          href={`/hr/jobs?cursor=${encodeURIComponent(nextCursor)}`}
                          className="font-semibold text-[#1E1B4B] hover:underline"
                        >
                          Next 20 →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Right Detail Section (Sticky Option B Solid Surface) */}
        <section className="flex min-w-0 flex-col rounded-[24px] border border-slate-200/80 bg-white shadow-xs lg:sticky lg:top-6">
          {selectedJob ? (
            <>
              <div className="border-b border-slate-200/80 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#EDE9F9] px-2.5 py-0.5 text-xs font-semibold text-[#1E1B4B]">
                        {selectedJob.departments?.name?.trim() || "General"}
                      </span>
                      {formatWorkSetup(selectedJob.work_setup) && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          {formatWorkSetup(selectedJob.work_setup)}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          selectedJob.is_published
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {selectedJob.is_published ? "Published" : "Draft"}
                      </span>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-[#1E1B4B]">
                        Owner: {selectedJob.ownerName?.trim() || "HR Team"}
                      </span>
                    </div>

                    <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                      {selectedJob.title}
                    </h2>
                    <p className="text-xs font-medium text-text-muted">
                      {formatDate(selectedJob.created_at)}
                      {selectedJob.closes_at ? ` · Closes ${formatDate(selectedJob.closes_at)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/hr/jobs/${selectedJob.id}`}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      Open Details
                    </Link>
                    <Link
                      href={`/hr/jobs/${selectedJob.id}/edit`}
                      className="rounded-xl bg-[#1E1B4B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
                    >
                      Edit Job
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-200/80 p-5 sm:p-6 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Location
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedJob.branch_name || selectedJob.location || "Not specified"}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Salary Range
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatCurrencyRange(selectedJob)}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Employment Type
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatEmploymentType(selectedJob.employment_type)}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Available Slots
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedJob.slots}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[1.3fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Job Description
                      </h3>
                      <span className="text-xs font-semibold text-[#1E1B4B]">
                        {selectedJob.applicantCount} applicant{selectedJob.applicantCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {selectedJob.description}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 sm:p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Requirements &amp; Qualifications
                    </h3>
                    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {selectedJob.requirements?.trim() || "No requirements were provided for this listing."}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Quick Summary
                    </h3>
                    <dl className="mt-3.5 space-y-3 text-sm">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          Department
                        </dt>
                        <dd className="mt-0.5 font-semibold text-slate-900">
                          {selectedJob.departments?.name?.trim() || "General"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          Published
                        </dt>
                        <dd className="mt-0.5 font-semibold text-slate-900">
                          {selectedJob.is_published ? "Yes" : "No"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          Closing Date
                        </dt>
                        <dd className="mt-0.5 font-semibold text-slate-900">
                          {selectedJob.closes_at ? formatDate(selectedJob.closes_at) : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          Required Skills
                        </dt>
                        <dd className="mt-2 flex flex-wrap gap-1.5">
                          {selectedSkills.length > 0 ? (
                            selectedSkills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-lg border border-indigo-100 bg-[#EDE9F9] px-2.5 py-0.5 text-xs font-semibold text-[#1E1B4B]"
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

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:p-5">
                    <p className="text-sm font-bold text-slate-900">Need to publish a new role?</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      Create new postings scoped to your workspace without leaving the portal.
                    </p>
                    <Link
                      href="/hr/jobs/new"
                      className="mt-3 inline-flex rounded-xl bg-[#1E1B4B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
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
                <p className="text-sm font-semibold text-slate-900">No job selected</p>
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
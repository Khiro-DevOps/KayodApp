import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Calendar, MapPin, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  PUBLIC_JOB_COLUMNS,
  formatBenefitChip,
  formatEmploymentType,
  formatPostedDate,
  formatSalaryRange,
  formatWorkSetup,
  getAppUrl,
  normalizeBenefits,
  type PublicJobPosting,
} from "@/lib/public-jobs";

export const metadata: Metadata = {
  title: "Open Jobs | Kayod",
  description: "Browse open job opportunities on Kayod across the Philippines.",
  openGraph: {
    title: "Open Jobs | Kayod",
    description: "Browse open job opportunities on Kayod across the Philippines.",
    url: getAppUrl("/jobs"),
    type: "website",
  },
};

const PAGE_SIZE = 12;

interface JobsPageProps {
  searchParams: Promise<{
    q?: string;
    employment_type?: string;
    work_setup?: string;
    location?: string;
    job_category?: string;
    page?: string;
  }>;
}

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, " ").trim();
}

function buildJobsUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val && val.trim()) {
      sp.set(key, val.trim());
    }
  }
  const qs = sp.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

export default async function PublicJobsPage({ searchParams }: JobsPageProps) {
  const raw = await searchParams;
  const q = raw.q?.trim() ?? "";
  const employmentType = raw.employment_type?.trim() ?? "";
  const workSetup = raw.work_setup?.trim() ?? "";
  const location = raw.location?.trim() ?? "";
  const jobCategory = raw.job_category?.trim() ?? "";
  const parsedPage = Number.parseInt(raw.page ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("public_job_postings")
    .select(PUBLIC_JOB_COLUMNS, { count: "exact" });

  if (q) {
    const safeQ = sanitizeSearchTerm(q);
    if (safeQ) {
      query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }
  }
  if (employmentType) {
    query = query.eq("employment_type", employmentType);
  }
  if (workSetup) {
    query = query.eq("work_setup", workSetup);
  }
  if (location) {
    query = query.ilike("location", `%${location}%`);
  }
  if (jobCategory) {
    query = query.eq("job_category", jobCategory);
  }

  const { data, count } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, to)
    .returns<PublicJobPosting[]>();

  const jobs = data ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters = Boolean(q || employmentType || workSetup || location || jobCategory);

  const filterParams = {
    q: q || undefined,
    employment_type: employmentType || undefined,
    work_setup: workSetup || undefined,
    location: location || undefined,
    job_category: jobCategory || undefined,
  };

  return (
    <div className="min-h-screen bg-surface-bg text-text-main">
      <header className="border-b border-border bg-card-bg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-brand-navy">
            Kayod
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/jobs" className="text-primary font-semibold">
              Jobs
            </Link>
            <Link href="/login" className="text-text-muted hover:text-text-main">
              Log in
            </Link>
            <Link
              href="/register/applicant"
              className="rounded-lg bg-primary px-3.5 py-2 text-on-primary hover:bg-primary-hover"
            >
              Register
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-main">Open Jobs</h1>
          <p className="mt-1 text-sm text-text-muted">
            {totalCount === 1 ? "1 open position" : `${totalCount} open positions`}
          </p>
        </div>

        <form
          method="get"
          action="/jobs"
          className="mb-8 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card-bg p-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search title or description"
              className="w-full rounded-xl border border-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          <input
            type="text"
            name="location"
            defaultValue={location}
            placeholder="Location"
            className="w-full rounded-xl border border-border bg-surface-bg px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
          />

          <select
            name="employment_type"
            defaultValue={employmentType}
            aria-label="Employment type"
            className="w-full rounded-xl border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
          >
            <option value="">All types</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="freelance">Freelance</option>
          </select>

          <select
            name="work_setup"
            defaultValue={workSetup}
            aria-label="Work setup"
            className="w-full rounded-xl border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
          >
            <option value="">All setups</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>

          <div className="flex gap-2">
            <input
              type="text"
              name="job_category"
              defaultValue={jobCategory}
              placeholder="Category"
              className="w-full min-w-0 rounded-xl border border-border bg-surface-bg px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Filter
            </button>
          </div>
        </form>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card-bg p-12 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-text-muted" />
            <h2 className="mt-3 text-lg font-semibold text-text-main">No jobs found</h2>
            <p className="mt-1 text-sm text-text-muted">
              {hasFilters
                ? "Try adjusting or clearing your search filters."
                : "There are no open positions right now. Check back soon."}
            </p>
            {hasFilters ? (
              <Link
                href="/jobs"
                className="mt-4 inline-flex rounded-xl bg-primary-light px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/15"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => {
              const salary = formatSalaryRange(
                job.salary_min,
                job.salary_max,
                job.currency ?? "PHP"
              );
              const posted = formatPostedDate(job.published_at);
              const benefits = normalizeBenefits(job.public_benefits).slice(0, 3);

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-card-bg p-5 transition-colors hover:border-primary"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-text-main line-clamp-2">
                          {job.title}
                        </h2>
                        {job.company_name ? (
                          <p className="mt-1 text-sm font-medium text-text-muted">
                            {job.company_name}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                      {job.location ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-surface-bg px-2.5 py-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                      ) : null}
                      <span className="rounded-lg bg-surface-bg px-2.5 py-1">
                        {formatWorkSetup(job.work_setup, job.is_remote)}
                      </span>
                      <span className="rounded-lg bg-surface-bg px-2.5 py-1">
                        {formatEmploymentType(job.employment_type)}
                      </span>
                    </div>

                    {salary ? (
                      <p className="mt-3 text-sm font-semibold text-primary">{salary}</p>
                    ) : null}

                    {benefits.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {benefits.map((benefit, index) => (
                          <span
                            key={`${job.id}-benefit-${index}`}
                            className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary"
                          >
                            {formatBenefitChip(benefit)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {posted ? (
                    <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-text-muted">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Posted {posted}</span>
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-8 flex items-center justify-between border-t border-border pt-6 text-sm">
            <span className="text-text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={buildJobsUrl({
                    ...filterParams,
                    page: String(currentPage - 1),
                  })}
                  className="rounded-xl border border-border bg-card-bg px-3.5 py-2 font-medium text-text-main hover:border-primary"
                >
                  Previous
                </Link>
              ) : null}
              {currentPage < totalPages ? (
                <Link
                  href={buildJobsUrl({
                    ...filterParams,
                    page: String(currentPage + 1),
                  })}
                  className="rounded-xl border border-border bg-card-bg px-3.5 py-2 font-medium text-text-main hover:border-primary"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

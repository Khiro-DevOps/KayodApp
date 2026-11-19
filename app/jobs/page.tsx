import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Calendar,
  Laptop,
  LayoutDashboard,
  MapPin,
  Search,
  Wallet,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { effectiveRole } from "@/lib/roles";
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

const WORK_SETUP_CHIPS = [
  { value: "", label: "All setups" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

const EMPLOYMENT_TYPE_CHIPS = [
  { value: "", label: "All types" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

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

function getWorkSetupPillClass(workSetup: string | null | undefined, isRemote?: boolean | null): string {
  const normalized = (workSetup ?? "").trim().toLowerCase();
  if (normalized === "remote" || normalized === "wfh" || (!normalized && isRemote)) {
    return "border-sky-200/80 bg-sky-50/80 text-sky-700";
  }
  if (normalized === "hybrid") {
    return "border-indigo-200/80 bg-indigo-50/80 text-indigo-700";
  }
  return "border-amber-200/80 bg-amber-50/80 text-amber-700";
}

function getDashboardHref(role: string): string {
  if (role === "hr_manager" || role === "admin") return "/hr";
  if (role === "employee") return "/employee/dashboard";
  return "/applicant/dashboard";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dashboardHref: string | null = null;
  if (user) {
    const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ??
      {}) as Record<string, unknown>;
    const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role?: string | null }>();
    dashboardHref = getDashboardHref(effectiveRole(profile?.role, authRole));
  }

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
      <header className="sticky top-0 z-30 border-b border-border bg-card-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center text-xl font-bold tracking-tight text-brand-navy"
            >
              Kayod
            </Link>
            <Link
              href="/jobs"
              className="inline-flex min-h-[44px] items-center rounded-full bg-primary-light px-3.5 text-sm font-semibold text-primary"
            >
              Jobs
            </Link>
          </div>

          <nav className="flex items-center gap-2 sm:gap-3 text-sm font-medium">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-main"
                >
                  Log in
                </Link>
                <Link
                  href="/register/applicant"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-navy px-4 font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        {/* Compact PWA Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-main lg:text-3xl">
              Open Jobs
            </h1>
            <p className="mt-0.5 text-sm text-text-muted">
              {totalCount === 1 ? "1 open position" : `${totalCount} open positions`} across the Philippines
            </p>
          </div>
          {hasFilters ? (
            <Link
              href="/jobs"
              className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-card-bg px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary-light"
            >
              Clear filters
            </Link>
          ) : null}
        </div>

        {/* Search & Filter Surface */}
        <section className="mb-6 space-y-3 rounded-3xl border border-border bg-card-bg p-4 shadow-sm sm:p-5">
          <form
            method="get"
            action="/jobs"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12"
          >
            <div className="relative lg:col-span-5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search role title or keywords"
                className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg py-2.5 pl-10 pr-3.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>

            <div className="lg:col-span-3">
              <input
                type="text"
                name="location"
                defaultValue={location}
                placeholder="Location (e.g. Cebu, Manila)"
                className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg px-3.5 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>

            <div className="lg:col-span-2">
              <input
                type="text"
                name="job_category"
                defaultValue={jobCategory}
                placeholder="Category"
                className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg px-3.5 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>

            {workSetup ? <input type="hidden" name="work_setup" value={workSetup} /> : null}
            {employmentType ? (
              <input type="hidden" name="employment_type" value={employmentType} />
            ) : null}

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="min-h-[44px] w-full rounded-2xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
              >
                Search Jobs
              </button>
            </div>
          </form>

          {/* Horizontal scrollable Material 3 filter chips */}
          <div className="flex flex-col gap-2 pt-1 lg:flex-row lg:items-center lg:justify-between">
            <div className="custom-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
              {WORK_SETUP_CHIPS.map((chip) => {
                const active = workSetup === chip.value;
                return (
                  <Link
                    key={`ws-${chip.value || "all"}`}
                    href={buildJobsUrl({
                      ...filterParams,
                      work_setup: chip.value || undefined,
                      page: undefined,
                    })}
                    className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition-colors ${
                      active
                        ? "border-brand-navy bg-brand-navy text-on-primary"
                        : "border-border bg-surface-bg text-text-muted hover:border-primary/40 hover:text-text-main"
                    }`}
                  >
                    {chip.label}
                  </Link>
                );
              })}
            </div>

            <div className="custom-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
              {EMPLOYMENT_TYPE_CHIPS.map((chip) => {
                const active = employmentType === chip.value;
                return (
                  <Link
                    key={`et-${chip.value || "all"}`}
                    href={buildJobsUrl({
                      ...filterParams,
                      employment_type: chip.value || undefined,
                      page: undefined,
                    })}
                    className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition-colors ${
                      active
                        ? "border-primary bg-primary-light text-primary"
                        : "border-border bg-card-bg text-text-muted hover:border-primary/40 hover:text-text-main"
                    }`}
                  >
                    {chip.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {jobs.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card-bg p-10 text-center shadow-sm">
            <Briefcase className="mx-auto h-10 w-10 text-text-muted" />
            <h2 className="mt-3 text-lg font-bold text-text-main">No jobs found</h2>
            <p className="mt-1 text-sm text-text-muted">
              {hasFilters
                ? "Try adjusting or clearing your search filters."
                : "There are no open positions right now. Check back soon."}
            </p>
            {hasFilters ? (
              <Link
                href="/jobs"
                className="mt-5 inline-flex min-h-[44px] items-center rounded-2xl bg-primary-light px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
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
              const benefits = normalizeBenefits(job.public_benefits).slice(0, 2);

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card-bg p-5 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-base font-bold text-text-main transition-colors group-hover:text-brand-navy line-clamp-2 sm:text-lg">
                        {job.title}
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted sm:text-sm">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-navy" />
                        <span className="truncate font-medium text-text-main">
                          {job.company_name?.trim() || "Verified Employer"}
                        </span>
                        {job.location ? (
                          <span className="inline-flex items-center gap-0.5 truncate text-text-muted">
                            <span>•</span>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{job.location}</span>
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {salary ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <Wallet className="h-3.5 w-3.5 shrink-0" />
                          {salary}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkSetupPillClass(
                          job.work_setup,
                          job.is_remote
                        )}`}
                      >
                        <Laptop className="h-3.5 w-3.5 shrink-0" />
                        {formatWorkSetup(job.work_setup, job.is_remote)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-primary-light px-2.5 py-1 text-xs font-semibold text-brand-navy">
                        <Briefcase className="h-3.5 w-3.5 shrink-0" />
                        {formatEmploymentType(job.employment_type)}
                      </span>
                    </div>

                    {job.description ? (
                      <p className="line-clamp-2 text-sm text-text-muted">{job.description}</p>
                    ) : null}

                    {benefits.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {benefits.map((benefit, index) => (
                          <span
                            key={`${job.id}-benefit-${index}`}
                            className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs font-medium text-primary"
                          >
                            {formatBenefitChip(benefit)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                      <Calendar className="h-3.5 w-3.5" />
                      {posted ? `Posted ${posted}` : "Open now"}
                    </span>
                    <span className="inline-flex min-h-[36px] items-center rounded-xl bg-brand-navy px-3.5 text-xs font-semibold text-on-primary transition-colors group-hover:bg-brand-navy-light">
                      View Details
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card-bg px-4 py-3 shadow-xs">
            <span className="text-xs font-semibold text-text-muted sm:text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={buildJobsUrl({
                    ...filterParams,
                    page: String(currentPage - 1),
                  })}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card-bg px-4 text-xs font-semibold text-text-main transition-colors hover:border-primary"
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
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card-bg px-4 text-xs font-semibold text-text-main transition-colors hover:border-primary"
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

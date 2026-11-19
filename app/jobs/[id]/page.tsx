import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Laptop,
  LayoutDashboard,
  MapPin,
  Users,
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
  mapJsonLdEmploymentType,
  normalizeBenefits,
  stripMarkup,
  truncateDescription,
  type PublicJobPosting,
} from "@/lib/public-jobs";

interface PublicJobDetailPageProps {
  params: Promise<{ id: string }>;
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

export async function generateMetadata({
  params,
}: PublicJobDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("public_job_postings")
    .select("id, title, description, company_name")
    .eq("id", id)
    .maybeSingle<Pick<PublicJobPosting, "id" | "title" | "description" | "company_name">>();

  if (!job) {
    return {
      title: "Job Not Found | Kayod",
    };
  }

  const title = job.company_name ? `${job.title} at ${job.company_name} | Kayod` : `${job.title} | Kayod`;
  const description =
    truncateDescription(job.description, 160) ||
    `Apply for ${job.title}${job.company_name ? ` at ${job.company_name}` : ""} on Kayod.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: getAppUrl(`/jobs/${id}`),
      type: "article",
    },
  };
}

export default async function PublicJobDetailPage({ params }: PublicJobDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("public_job_postings")
    .select(PUBLIC_JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle<PublicJobPosting>();

  if (!job) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let applyMode: "anon" | "candidate" | "hidden" = "anon";
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

    const role = effectiveRole(profile?.role, authRole);
    applyMode = role === "candidate" ? "candidate" : "hidden";
    dashboardHref = getDashboardHref(role);
  }

  const salary = formatSalaryRange(job.salary_min, job.salary_max, job.currency ?? "PHP");
  const posted = formatPostedDate(job.published_at);
  const closes = formatPostedDate(job.closes_at);
  const benefits = normalizeBenefits(job.public_benefits);
  const skills = Array.isArray(job.required_skills)
    ? job.required_skills.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const nextPath = encodeURIComponent(`/jobs/${id}`);
  const hasSalaryRange =
    typeof job.salary_min === "number" &&
    Number.isFinite(job.salary_min) &&
    typeof job.salary_max === "number" &&
    Number.isFinite(job.salary_max);
  const employmentTypeJsonLd = mapJsonLdEmploymentType(job.employment_type);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: stripMarkup(job.description) || job.title,
    ...(job.published_at ? { datePosted: job.published_at } : {}),
    ...(job.closes_at ? { validThrough: job.closes_at } : {}),
    ...(employmentTypeJsonLd ? { employmentType: employmentTypeJsonLd } : {}),
    ...(job.company_name
      ? {
          hiringOrganization: {
            "@type": "Organization",
            name: job.company_name,
          },
        }
      : {}),
    ...(job.location
      ? {
          jobLocation: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              streetAddress: job.location,
            },
          },
        }
      : {}),
    ...(hasSalaryRange
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: job.currency || "PHP",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salary_min,
              maxValue: job.salary_max,
              unitText: "MONTH",
            },
          },
        }
      : {}),
  };
  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-surface-bg pb-28 text-text-main lg:pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />

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

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <Link
          href="/jobs"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-text-muted transition-colors hover:text-brand-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Main Job Details */}
          <div className="space-y-6 lg:col-span-8">
            <div className="rounded-3xl border border-border bg-card-bg p-6 shadow-xs sm:p-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-text-main sm:text-3xl">
                  {job.title}
                </h1>
                {job.company_name ? (
                  <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-text-muted">
                    <Building2 className="h-4 w-4 text-brand-navy" />
                    <span>{job.company_name}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                {job.location ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-main">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {job.location}
                  </span>
                ) : null}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${getWorkSetupPillClass(
                    job.work_setup,
                    job.is_remote
                  )}`}
                >
                  <Laptop className="h-3.5 w-3.5" />
                  {formatWorkSetup(job.work_setup, job.is_remote)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-primary-light px-3 py-1.5 text-brand-navy">
                  <Briefcase className="h-3.5 w-3.5" />
                  {formatEmploymentType(job.employment_type)}
                </span>
                {job.job_category ? (
                  <span className="rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-muted">
                    {job.job_category}
                  </span>
                ) : null}
                {typeof job.min_experience === "number" && job.min_experience > 0 ? (
                  <span className="rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-muted">
                    {job.min_experience}+ yrs experience
                  </span>
                ) : null}
                {typeof job.slots === "number" && job.slots > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-muted">
                    <Users className="h-3.5 w-3.5" />
                    {job.slots} {job.slots === 1 ? "slot" : "slots"}
                  </span>
                ) : null}
                {posted ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    Posted {posted}
                  </span>
                ) : null}
                {closes ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-bg px-3 py-1.5 text-text-muted">
                    <Clock className="h-3.5 w-3.5" />
                    Closes {closes}
                  </span>
                ) : null}
              </div>

              {job.description ? (
                <section className="mt-7 border-t border-border pt-6">
                  <h2 className="text-lg font-bold text-text-main">Description</h2>
                  <div className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-text-main">
                    {job.description}
                  </div>
                </section>
              ) : null}

              {job.responsibilities ? (
                <section className="mt-7 border-t border-border pt-6">
                  <h2 className="text-lg font-bold text-text-main">Responsibilities</h2>
                  <div className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-text-main">
                    {job.responsibilities}
                  </div>
                </section>
              ) : null}

              {job.requirements ? (
                <section className="mt-7 border-t border-border pt-6">
                  <h2 className="text-lg font-bold text-text-main">Requirements</h2>
                  <div className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-text-main">
                    {job.requirements}
                  </div>
                </section>
              ) : null}

              {skills.length > 0 ? (
                <section className="mt-7 border-t border-border pt-6">
                  <h2 className="text-lg font-bold text-text-main">Required Skills</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-xl border border-border bg-surface-bg px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          {/* Right Column: Sticky Apply + Compensation Summary */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
            <div className="rounded-3xl border border-border bg-card-bg p-6 shadow-xs">
              {salary ? (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    <Wallet className="h-3.5 w-3.5" />
                    <span>Compensation</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-emerald-800">{salary}</p>
                </div>
              ) : null}

              {benefits.length > 0 ? (
                <div className={salary ? "mt-5" : ""}>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted">
                    Benefits &amp; Allowances
                  </h2>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {benefits.map((benefit, index) => (
                      <span
                        key={`benefit-${index}`}
                        className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary"
                      >
                        {formatBenefitChip(benefit)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {applyMode === "anon" ? (
                <div className={`${salary || benefits.length > 0 ? "mt-6 border-t border-border pt-5" : ""} hidden space-y-2.5 lg:block`}>
                  <Link
                    href={`/login?next=${nextPath}`}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
                  >
                    Apply for this role
                  </Link>
                  <Link
                    href={`/register/applicant?next=${nextPath}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-border bg-surface-bg px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                  >
                    Create an account
                  </Link>
                </div>
              ) : applyMode === "candidate" ? (
                <div className={`${salary || benefits.length > 0 ? "mt-6 border-t border-border pt-5" : ""} hidden lg:block`}>
                  <Link
                    href={`/applicant/jobs/${id}/apply`}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
                  >
                    Apply Now
                  </Link>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile Sticky Bottom Apply Bar */}
      {applyMode !== "hidden" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card-bg/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          {applyMode === "anon" ? (
            <div className="mx-auto flex max-w-lg items-center gap-2.5">
              <Link
                href={`/register/applicant?next=${nextPath}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border border-border bg-surface-bg px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
              >
                Create account
              </Link>
              <Link
                href={`/login?next=${nextPath}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-brand-navy px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
              >
                Apply
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-lg">
              <Link
                href={`/applicant/jobs/${id}/apply`}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
              >
                Apply Now
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, Calendar, Clock, MapPin } from "lucide-react";

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
    <div className="min-h-screen bg-surface-bg text-text-main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      <header className="border-b border-border bg-card-bg">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-brand-navy">
            Kayod
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/jobs" className="text-primary font-semibold">
              Jobs
            </Link>
            {!user ? (
              <>
                <Link href="/login" className="text-text-muted hover:text-text-main">
                  Log in
                </Link>
                <Link
                  href="/register/applicant"
                  className="rounded-lg bg-primary px-3.5 py-2 text-on-primary hover:bg-primary-hover"
                >
                  Register
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-main"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>

        <div className="mt-5 rounded-2xl border border-border bg-card-bg p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-main sm:text-3xl">
                {job.title}
              </h1>
              {job.company_name ? (
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-text-muted">
                  <Building2 className="h-4 w-4" />
                  <span>{job.company_name}</span>
                </div>
              ) : null}
            </div>

            {applyMode === "anon" ? (
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <Link
                  href={`/login?next=${nextPath}`}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  Apply
                </Link>
                <Link
                  href={`/register/applicant?next=${nextPath}`}
                  className="text-center text-xs font-medium text-primary hover:underline"
                >
                  Create an account
                </Link>
              </div>
            ) : applyMode === "candidate" ? (
              <Link
                href={`/applicant/jobs/${id}/apply`}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Apply
              </Link>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-text-muted">
            {job.location ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-bg px-3 py-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-bg px-3 py-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {formatWorkSetup(job.work_setup, job.is_remote)}
            </span>
            <span className="rounded-lg bg-surface-bg px-3 py-1.5">
              {formatEmploymentType(job.employment_type)}
            </span>
            {job.job_category ? (
              <span className="rounded-lg bg-surface-bg px-3 py-1.5">{job.job_category}</span>
            ) : null}
            {typeof job.min_experience === "number" && job.min_experience > 0 ? (
              <span className="rounded-lg bg-surface-bg px-3 py-1.5">
                {job.min_experience}+ yrs experience
              </span>
            ) : null}
            {typeof job.slots === "number" && job.slots > 0 ? (
              <span className="rounded-lg bg-surface-bg px-3 py-1.5">
                {job.slots} {job.slots === 1 ? "slot" : "slots"}
              </span>
            ) : null}
            {posted ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-bg px-3 py-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Posted {posted}
              </span>
            ) : null}
            {closes ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-bg px-3 py-1.5">
                <Clock className="h-3.5 w-3.5" />
                Closes {closes}
              </span>
            ) : null}
          </div>

          {salary ? (
            <div className="mt-5 rounded-xl bg-primary-light px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Salary
              </span>
              <p className="text-base font-bold text-primary">{salary}</p>
            </div>
          ) : null}

          {benefits.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
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
            </section>
          ) : null}

          {job.description ? (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-text-main">Description</h2>
              <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-main">
                {job.description}
              </div>
            </section>
          ) : null}

          {job.responsibilities ? (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-text-main">Responsibilities</h2>
              <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-main">
                {job.responsibilities}
              </div>
            </section>
          ) : null}

          {job.requirements ? (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-text-main">Requirements</h2>
              <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-main">
                {job.requirements}
              </div>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-text-main">Required Skills</h2>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-lg border border-border bg-surface-bg px-3 py-1 text-xs font-medium text-text-main"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

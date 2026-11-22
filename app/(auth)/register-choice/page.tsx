import Link from "next/link";
import { ArrowRight, Building2, UserCheck } from "lucide-react";

interface RegisterChoicePageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function RegisterChoicePage({ searchParams }: RegisterChoicePageProps) {
  const { next } = await searchParams;
  const applicantHref = next?.trim()
    ? `/register/applicant?next=${encodeURIComponent(next.trim())}`
    : "/register/applicant";

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center py-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center text-2xl font-bold tracking-tight text-brand-navy"
          >
            Kayod
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-full bg-primary-light px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            Already have an account? Log in
          </Link>
        </div>

        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight text-text-main sm:text-3xl">
            How would you like to use Kayod?
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Choose your account path to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="flex flex-col justify-between rounded-3xl border border-border bg-card-bg p-6 shadow-xs sm:p-8">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-brand-navy">
                <UserCheck className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-text-main">
                I am a Job Seeker / Applicant
              </h2>
              <p className="text-sm leading-relaxed text-text-muted">
                Create a free applicant account to browse open roles, upload your resume, track interviews, and sign offers online.
              </p>
            </div>
            <div className="mt-6">
              <Link
                href={applicantHref}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
              >
                <span>Continue as Applicant</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className="flex flex-col justify-between rounded-3xl border border-border bg-card-bg p-6 shadow-xs sm:p-8">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-brand-navy">
                <Building2 className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-text-main">
                I am an Employer / HR Admin
              </h2>
              <p className="text-sm leading-relaxed text-text-muted">
                Set up your company workspace, default office branch, job postings, and AI-assisted hiring pipeline with guided onboarding.
              </p>
            </div>
            <div className="mt-6">
              <Link
                href="/register/hr"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-brand-navy bg-card-bg px-5 text-sm font-semibold text-brand-navy transition-colors hover:bg-primary-light active:scale-95"
              >
                <span>Onboard Employer Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

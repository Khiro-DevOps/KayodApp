import Link from "next/link";

export default function RegisterChoicePage() {
  return (
    <main className="min-h-screen bg-[#faf8ff] flex items-center justify-center p-6">
      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-white p-6">
          <h2 className="font-(family-name:--font-heading) text-lg font-semibold text-text-primary">
            I am an Employer / HR Admin
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Set up your company account, manage job postings and applicants with Kayod's
            enterprise onboarding flow.
          </p>
          <div className="mt-6">
            <Link
              href="/register"
              className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Continue as Employer
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-6">
          <h2 className="font-(family-name:--font-heading) text-lg font-semibold text-text-primary">
            I am a Job Seeker / Applicant
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Create a simple applicant account to apply for jobs, track applications, and
            manage your profile on the mobile-friendly portal.
          </p>
          <div className="mt-6">
            <Link
              href="/register/applicant"
              className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Continue as Applicant
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const POINTS = [
  "See your match score on every job",
  "Track every application in one place",
  "Get interview and offer updates in the app",
];

export default function FindYourJobSection() {
  return (
    <section className="bg-surface-bg px-6 py-16">
      <div className="mx-auto max-w-6xl rounded-2xl border border-border bg-card-bg p-8 sm:p-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-3xl font-bold tracking-tight text-text-main">
              Can&apos;t find the job that fits you?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-text-muted">
              Create a free profile and upload your resume. Kayod scores every job against your
              skills so your best matches come first.
            </p>
            <ul className="mt-6 space-y-3">
              {POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-sm font-medium text-text-main">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex lg:col-span-5 lg:justify-end">
            <Link
              href="/register/applicant"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

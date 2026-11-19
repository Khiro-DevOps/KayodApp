import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const POINTS = [
  "See your match score on every job",
  "Track every application in one place",
  "Get interview and offer updates in the app",
];

export default function FindYourJobSection() {
  return (
    <section
      id="find-job"
      className="relative flex min-h-[100svh] scroll-mt-16 flex-col justify-center overflow-hidden bg-[#FDF8F2] px-6 py-20 lg:py-24"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 top-1/2 h-[540px] w-[540px] -translate-y-1/2 rounded-full border border-[#1E1B4B]/8" />
        <div className="absolute -right-20 top-1/2 h-[360px] w-[360px] -translate-y-1/2 rounded-full border border-[#1E1B4B]/6" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl rounded-3xl border border-indigo-100/80 bg-white/80 p-8 shadow-[0_8px_30px_rgb(30,27,75,0.06)] backdrop-blur-md sm:p-12">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="inline-flex rounded-full bg-[#DFDCFF] px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#1E1B4B]">
              Find Your Job
            </span>
            <h2 className="mt-4 font-[family-name:var(--font-poppins)] text-3xl font-bold tracking-tight text-[#1E1B4B] sm:text-4xl">
              Can&apos;t find the job that fits you?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#484551]">
              Create a free profile and upload your resume. Kayod scores every job against your
              skills so your best matches come first.
            </p>
            <ul className="mt-6 space-y-3">
              {POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-sm font-medium text-[#1E1B4B]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E1B4B]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex lg:col-span-5 lg:justify-end">
            <Link
              href="/register/applicant"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E1B4B] px-7 py-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-900 active:scale-95"
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

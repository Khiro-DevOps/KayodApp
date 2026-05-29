import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChartColumnBig,
  FileText,
  LayoutDashboard,
  Smartphone,
  Sparkles,
  type LucideIcon,
  Workflow,
} from "lucide-react";

import { SUBSCRIPTION_TIERS } from "@/lib/subscription-tiers";
import { SmoothScrollButton } from "@/components/smooth-scroll-button";

const features: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "AI Screening",
    description: "Rank applicants faster with intelligent matching, scoring, and shortlisting.",
    icon: Sparkles,
  },
  {
    title: "Contract Signing",
    description: "Move from offer to signed contract with a clean, guided digital flow.",
    icon: FileText,
  },
  {
    title: "Mobile Portal",
    description: "Keep hiring and employee workflows accessible on mobile and PWA surfaces.",
    icon: Smartphone,
  },
  {
    title: "Time Tracking",
    description: "Bring scheduling, attendance, and payroll signals into one system.",
    icon: CalendarClock,
  },
];

const metrics = [
  { label: "Applicants Reviewed", value: "4.8k" },
  { label: "Avg. Time to Hire", value: "3.2d" },
  { label: "Signed Offers", value: "98.4%" },
];

const activityItems = [
  {
    title: "New Candidate",
    meta: "Marketing Manager",
    time: "2m ago",
    tone: "bg-[#DFDCFF] text-[#61607D]",
  },
  {
    title: "Contract Signed",
    meta: "Lead Developer",
    time: "1h ago",
    tone: "bg-[#E8E7EF] text-[#484551]",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F5F4FC] text-[#1A1B21]">
      <header className="fixed left-0 top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#2A2650] px-6 shadow-[0_2px_24px_rgba(26,27,33,0.08)]">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-[family-name:var(--font-poppins)] text-[22px] font-bold tracking-tight text-white"
          >
            Kayod
          </Link>
          <nav className="ml-6 hidden items-center gap-6 md:flex">
            <a className="text-[15px] text-white/80 transition-colors hover:text-white" href="#features">
              Features
            </a>
            <a className="text-[15px] text-white/80 transition-colors hover:text-white" href="#pricing">
              Pricing
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[15px] text-white/80 transition-colors hover:text-white">
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-[8px] bg-white px-6 py-2 font-[family-name:var(--font-poppins)] text-[15px] font-bold text-[#332477] transition-all hover:bg-white/90 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden bg-[#F5F4FC] px-6 pt-2 pb-6 text-center text-[#1A1B21]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#332477]/12" />
            <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#332477]/8" />
          </div>

          <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-center gap-7 py-4 lg:grid lg:grid-cols-[1.08fr_0.78fr] lg:text-left">
            <div className="flex max-w-3xl flex-col items-center gap-4 lg:items-start lg:pt-0">
              <span className="inline-flex rounded-full bg-[#DFDCFF] px-4 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                Efficiency Elevated
              </span>
              <h1 className="max-w-2xl font-[family-name:var(--font-poppins)] text-[48px] font-bold leading-[52px] tracking-tight text-[#1A1B21] md:text-[54px] md:leading-[60px] lg:text-[50px] lg:leading-[54px]">
                Hire smarter or find better work faster
              </h1>
              <p className="max-w-2xl text-[15px] leading-[22px] text-[#484551] md:max-w-xl md:text-[16px] md:leading-[24px] lg:max-w-[31rem]">
                AI screening, simple contract signing, and a mobile-first experience built for the speed of modern business.
                The HRIS that works as hard as you do.
              </p>

              <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row lg:items-start">
                <SmoothScrollButton
                  targetId="pricing"
                  offset={52}
                  className="rounded-[8px] bg-[#332477] px-8 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-white transition-all hover:bg-[#4A3D8F] active:scale-95"
                >
                  I&apos;m hiring
                </SmoothScrollButton>
                <SmoothScrollButton
                  targetId="applicant-journey"
                  className="rounded-[8px] border border-[#332477] px-8 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#332477] transition-all hover:bg-[#332477]/5 active:scale-95"
                >
                  Find a job
                </SmoothScrollButton>
              </div>
            </div>

            <div className="w-full max-w-[460px] lg:justify-self-end">
              <div className="rounded-[12px] border border-[#E8E6F8] bg-white p-3 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
                <div className="overflow-hidden rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF]">
                  <div className="flex items-center justify-between border-b border-[#E8E6F8] bg-white px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
                      <span className="h-3 w-3 rounded-full bg-[#F59E0B]" />
                      <span className="h-3 w-3 rounded-full bg-[#16A34A]" />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                      Kayod HR workspace
                    </span>
                  </div>

                  <div className="grid gap-3 p-3">
                    <div className="rounded-[12px] border border-[#E8E6F8] bg-white p-3.5 text-left">
                      <div className="flex items-start justify-between gap-4 border-b border-[#E8E6F8] pb-3">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                            Applicant pipeline
                          </p>
                          <h2 className="mt-1 font-[family-name:var(--font-poppins)] text-[16px] font-semibold text-[#1A1B21]">
                            Live hiring overview
                          </h2>
                        </div>
                        <div className="rounded-[8px] bg-[#DFDCFF] p-1.5 text-[#332477]">
                          <LayoutDashboard className="h-4.5 w-4.5" />
                        </div>
                      </div>

                      <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
                        <div className="rounded-[12px] bg-[#FAF8FF] p-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Screening</p>
                          <p className="mt-1 font-[family-name:var(--font-poppins)] text-[18px] font-bold text-[#1A1B21]">
                            128
                          </p>
                        </div>
                        <div className="rounded-[12px] bg-[#FAF8FF] p-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Offers</p>
                          <p className="mt-1 font-[family-name:var(--font-poppins)] text-[18px] font-bold text-[#1A1B21]">
                            22
                          </p>
                        </div>
                        <div className="rounded-[12px] bg-[#FAF8FF] p-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Signed</p>
                          <p className="mt-1 font-[family-name:var(--font-poppins)] text-[18px] font-bold text-[#1A1B21]">
                            18
                          </p>
                        </div>
                      </div>

                      <div className="mt-3.5 rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] p-3">
                        <div className="mb-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                              Score distribution
                            </p>
                            <p className="mt-1 font-[family-name:var(--font-poppins)] text-[16px] font-semibold text-[#1A1B21]">
                              Match confidence across the shortlist
                            </p>
                          </div>
                          <ChartColumnBig className="h-4.5 w-4.5 text-[#332477]" />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[34, 42, 48, 38].map((height, index) => (
                            <div key={`${height}-${index}`} className="flex items-end rounded-[8px] bg-white p-2">
                              <div className="w-full rounded-t-[4px] bg-[#332477]" style={{ height: `${height}px` }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[12px] bg-[#332477] p-3.5 text-left text-white shadow-[0_10px_30px_rgba(50,41,106,0.22)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-white/70">
                            Mobile Experience
                          </span>
                          <h3 className="mt-1 font-[family-name:var(--font-poppins)] text-[15px] font-semibold">
                            Manage hiring on the go.
                          </h3>
                        </div>
                        <div className="rounded-[12px] bg-white/10 p-2.5">
                          <Smartphone className="h-7 w-7" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="applicant-journey" className="bg-white px-6 py-14">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                Applicant Journey
              </span>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1A1B21]">
                One system for the full applicant flow
              </h2>
              <p className="mt-3 text-[15px] leading-[22px] text-[#484551]">
                From resume generation to scoring, digital submission, and offer completion, applicants stay inside one
                connected experience.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1A1B21]">
                  AI resume generation
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Help applicants generate and tailor their resume directly in the same app they use to apply.
                </p>
              </article>

              <article className="rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1A1B21]">
                  Smart score matching
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Surface match confidence, role fit, and recommendation reasons without sending users to another tool.
                </p>
              </article>

              <article className="rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1A1B21]">
                  Digital application flow
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Keep forms, documents, and status updates in one place so nothing gets lost between stages.
                </p>
              </article>

              <article className="rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
                  <Workflow className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1A1B21]">
                  End-to-end journey
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Move from application to offer without switching systems, re-entering data, or losing context.
                </p>
              </article>
            </div>

            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[12px] border border-[#E8E6F8] bg-[#FAF8FF] px-5 py-4 shadow-[0_4px_12px_rgba(46,37,102,0.05)] md:flex-row md:items-center">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">For applicants</p>
                <p className="mt-1 font-[family-name:var(--font-poppins)] text-[18px] font-semibold text-[#1A1B21]">
                  Start your application path in one tap.
                </p>
              </div>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-[8px] bg-[#332477] px-6 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-white transition-all hover:bg-[#4A3D8F] active:scale-95"
              >
                Create an account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Capabilities</span>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1A1B21]">
                Platform features built for modern HR teams
              </h2>
              <p className="mt-3 text-[15px] leading-[22px] text-[#484551]">
                Designed to keep the hiring process structured, fast, and readable from desktop to mobile.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <article
                    key={feature.title}
                    className="rounded-[12px] border border-[#E8E6F8] bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1A1B21]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-[#FAF8FF] px-6 pt-8 pb-16">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Pricing</span>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1A1B21]">
                Choose the plan that fits your team
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-[22px] text-[#484551]">
                Clear tiers, simple limits, and a direct path from landing page to registration.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3 lg:items-stretch">
              {SUBSCRIPTION_TIERS.map((tier) => (
                <article
                  key={tier.plan}
                  className={`flex h-full flex-col rounded-[12px] border bg-white p-4 shadow-[0_4px_12px_rgba(46,37,102,0.05)] ${
                    tier.highlighted ? "border-[#332477] ring-2 ring-[#332477]/10" : "border-[#E8E6F8]"
                  }`}
                >
                  {tier.highlighted ? (
                    <span className="inline-flex rounded-full bg-[#DFDCFF] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                      Recommended
                    </span>
                  ) : null}

                  <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-[#1A1B21]">
                    {tier.name}
                  </h3>
                  <p className="mt-1 text-[14px] text-[#484551]">{tier.limits}</p>
                  <p className="mt-4 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1A1B21]">
                    {tier.price}
                  </p>

                  <ul className="mt-4 space-y-3 text-[14px] leading-[20px] text-[#1A1B21]">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-1 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#DFDCFF] text-[#332477]">
                          <BadgeCheck className="h-3.5 w-3.5" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/register?plan=${encodeURIComponent(tier.plan)}`}
                    className={`mt-6 inline-flex w-full items-center justify-center rounded-[8px] px-4 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold transition-all active:scale-95 ${
                      tier.highlighted
                        ? "bg-[#332477] text-white hover:bg-[#4A3D8F]"
                        : "border border-[#332477] text-[#332477] hover:bg-[#332477]/5"
                    }`}
                  >
                    Get started
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#332477] px-6 py-20 text-white">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <h2 className="font-[family-name:var(--font-poppins)] text-[36px] font-bold tracking-tight md:text-[44px]">
              Ready to transform your hiring process?
            </h2>
            <p className="max-w-2xl text-[15px] leading-[22px] text-white/80">
              Join teams using Kayod for a smoother, faster, and more professional HR experience.
            </p>
            <Link
              href="/register"
              className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-white px-8 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#332477] transition-all hover:bg-white/90 active:scale-95"
            >
              Start 14-Day Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer id="resources" className="mt-12 border-t border-[#E0D9FC] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div>
            <p className="font-[family-name:var(--font-poppins)] text-[22px] font-bold tracking-tight text-[#332477]">
              Kayod
            </p>
            <p className="mt-1 text-[13px] text-[#484551]">© 2026 Kayod HRIS. Built for modern teams.</p>
          </div>
          <div className="flex items-center gap-6 text-[15px] text-[#484551]">
            <Link className="transition-colors hover:text-[#332477]" href="/login">
              Login
            </Link>
            <Link className="transition-colors hover:text-[#332477]" href="/register">
              Register
            </Link>
            <a className="transition-colors hover:text-[#332477]" href="#features">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
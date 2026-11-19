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

import { SmoothScrollButton } from "@/components/smooth-scroll-button";
import BookDemoModal from "@/components/landing/BookDemoModal";
import FindYourJobSection from "@/components/landing/FindYourJobSection";

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
    <div className="min-h-screen overflow-x-hidden bg-[#FCFBFF] text-[#1A1B21]">
      <header className="fixed left-0 top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#1E1B4B] px-6 shadow-[0_2px_24px_rgba(26,27,33,0.08)]">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-[family-name:var(--font-poppins)] text-[22px] font-bold tracking-tight text-white"
          >
            Kayod
          </Link>
          <nav className="ml-6 hidden items-center gap-6 md:flex">
            <Link
              href="/jobs"
              className="text-[15px] text-white/80 transition-colors hover:text-white"
            >
              Jobs
            </Link>
            <SmoothScrollButton
              targetId="features"
              offset={64}
              className="text-[15px] text-white/80 transition-colors hover:text-white"
            >
              Features
            </SmoothScrollButton>
            <SmoothScrollButton
              targetId="pricing"
              offset={64}
              className="text-[15px] text-white/80 transition-colors hover:text-white"
            >
              Pricing
            </SmoothScrollButton>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[15px] text-white/80 transition-colors hover:text-white">
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-white px-6 py-2 font-[family-name:var(--font-poppins)] text-[15px] font-bold text-[#1E1B4B] transition-all hover:bg-white/90 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center overflow-hidden bg-[#FCFBFF] px-6 py-12 text-center text-[#1A1B21] lg:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(253,248,242,0.95),_transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#1E1B4B]/10" />
            <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#1E1B4B]/8" />
          </div>

          <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-4 md:px-8 lg:grid-cols-12">
            {/* Left Text Column - Span 6 or 7 columns */}
            <div className="lg:col-span-6 flex flex-col space-y-6 text-left min-w-0">
              <span className="inline-flex w-fit rounded-full bg-[#DFDCFF] px-4 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[#1E1B4B]">
                Efficiency Elevated
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-tight">
                Hire smarter or find better work faster
              </h1>
              <p className="w-full max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed text-left whitespace-normal break-words">
                AI screening, simple contract signing, and a mobile-first experience built for the speed of modern business.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <BookDemoModal
                  triggerLabel="I'm hiring"
                  triggerClassName="rounded-[8px] bg-[#1E1B4B] px-8 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-white transition-all hover:bg-indigo-900 active:scale-95"
                />
                <Link
                  href="/jobs"
                  className="inline-flex items-center justify-center rounded-[8px] border border-[#1E1B4B] px-8 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#1E1B4B] transition-all hover:bg-[#1E1B4B]/5 active:scale-95"
                >
                  Browse jobs
                </Link>
              </div>
            </div>

            {/* Right Preview Graphic - Span 5 or 6 columns */}
            <div className="lg:col-span-6 w-full">
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

        <section
          id="journey"
          className="flex min-h-[100svh] scroll-mt-16 flex-col justify-center overflow-hidden bg-[#FDF8F2] px-6 py-20 lg:py-24"
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="max-w-2xl">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">
                Applicant Journey
              </span>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1E1B4B]">
                One system for the full applicant flow
              </h2>
              <p className="mt-3 text-[15px] leading-[22px] text-[#484551]">
                From resume generation to scoring, digital submission, and offer completion, applicants stay inside one
                connected experience.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-indigo-100/80 bg-white/80 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.05)] backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#1E1B4B]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1E1B4B]">
                  AI resume generation
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Help applicants generate and tailor their resume directly in the same app they use to apply.
                </p>
              </article>

              <article className="rounded-2xl border border-indigo-100/80 bg-white/80 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.05)] backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#1E1B4B]">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1E1B4B]">
                  Smart score matching
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Surface match confidence, role fit, and recommendation reasons without sending users to another tool.
                </p>
              </article>

              <article className="rounded-2xl border border-indigo-100/80 bg-white/80 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.05)] backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#1E1B4B]">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1E1B4B]">
                  Digital application flow
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Keep forms, documents, and status updates in one place so nothing gets lost between stages.
                </p>
              </article>

              <article className="rounded-2xl border border-indigo-100/80 bg-white/80 p-5 shadow-[0_8px_30px_rgb(30,27,75,0.05)] backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#1E1B4B]">
                  <Workflow className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1E1B4B]">
                  End-to-end journey
                </h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">
                  Move from application to offer without switching systems, re-entering data, or losing context.
                </p>
              </article>
            </div>

            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-indigo-100/80 bg-white/80 px-5 py-4 shadow-[0_8px_30px_rgb(30,27,75,0.05)] backdrop-blur-md md:flex-row md:items-center">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">For applicants</p>
                <p className="mt-1 font-[family-name:var(--font-poppins)] text-[18px] font-semibold text-[#1E1B4B]">
                  Start your application path in one tap.
                </p>
              </div>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-[8px] bg-[#1E1B4B] px-6 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-white transition-all hover:bg-indigo-900 active:scale-95"
              >
                Create an account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="relative flex min-h-[100svh] scroll-mt-16 flex-col justify-center overflow-hidden bg-[#F6F5FC] px-6 py-20 lg:py-24"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-44 -top-44 h-[520px] w-[520px] rounded-full border border-[#1E1B4B]/10" />
            <div className="absolute -left-24 -top-24 h-[340px] w-[340px] rounded-full border border-[#1E1B4B]/8" />
          </div>

          <div className="relative mx-auto w-full max-w-6xl">
            <div className="max-w-2xl">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Capabilities</span>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-[32px] font-bold tracking-tight text-[#1E1B4B]">
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
                    className="rounded-2xl border border-indigo-100/80 bg-white p-5 shadow-[0_4px_20px_rgb(30,27,75,0.04)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#1E1B4B]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-[family-name:var(--font-poppins)] text-[17px] font-semibold text-[#1E1B4B]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-[22px] text-[#484551]">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* PRICING SECTION */}
        <section
          id="pricing"
          className="flex min-h-[100svh] scroll-mt-16 flex-col justify-center overflow-hidden bg-[#FCFBFF] px-6 py-20 lg:py-24"
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6 w-full min-w-0 text-center lg:pt-0 lg:text-left pr-0 lg:pr-6">
                <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#61607D]">Pricing</span>
                <h2 className="mt-2 font-[family-name:var(--font-poppins)] w-full text-3xl md:text-5xl font-bold tracking-tight text-[#1E1B4B] leading-tight block break-words whitespace-normal">
                  Enterprise pricing for teams that need everything
                </h2>
                <p className="mx-auto mt-3 w-full max-w-2xl text-[15px] leading-[22px] text-[#484551] lg:mx-0 block break-words whitespace-normal">
                  Custom pricing for organizations that want the full hiring and employee experience in one platform.
                </p>
              </div>

              <div className="lg:col-span-6 flex justify-center lg:justify-end min-w-0">
                <article className="flex w-full max-w-[540px] flex-col rounded-3xl border border-[#1E1B4B] bg-[#1E1B4B] p-6 text-white shadow-[0_20px_50px_rgba(30,27,75,0.22)] sm:p-8">
                  <div className="flex flex-col gap-4 sm:gap-5">
                    <div>
                      <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.05em] text-indigo-100">
                        Enterprise
                      </span>
                      <h3 className="mt-3 font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-white sm:mt-4 sm:text-[22px]">
                        Kayod Enterprise
                      </h3>
                      <p className="mt-1 text-[13px] text-indigo-200 sm:text-[14px]">
                        Unlimited listings · Unlimited applicants · Full AI suite
                      </p>
                      <p className="mt-3 font-[family-name:var(--font-poppins)] text-[28px] font-bold tracking-tight text-white sm:mt-4 sm:text-[32px]">
                        Custom pricing
                      </p>
                    </div>

                    <ul className="grid gap-2.5 text-[13px] leading-[18px] text-indigo-50 sm:grid-cols-2 sm:gap-3 sm:text-[14px] sm:leading-[20px]">
                      {[
                        "Pipeline",
                        "DocuSeal",
                        "Applicant portal",
                        "AI scoring",
                        "AI resume parsing",
                        "Analytics",
                        "Priority support",
                        "Custom contract templates",
                        "Employee portal",
                      ].map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 sm:gap-3">
                          <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/15 text-white">
                            <BadgeCheck className="h-3.5 w-3.5" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <BookDemoModal
                      triggerClassName="w-full rounded-xl bg-white px-6 py-3 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#1E1B4B] transition-all hover:bg-indigo-50 active:scale-95"
                    />
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <FindYourJobSection />
      </main>

      <footer id="resources" className="bg-[#1E1B4B] px-6 py-12 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 border-b border-white/10 pb-10 text-center md:flex-row md:text-left">
          <div>
            <h2 className="font-[family-name:var(--font-poppins)] text-2xl font-bold tracking-tight md:text-3xl">
              Ready to transform your hiring process?
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-[22px] text-indigo-200">
              Join teams using Kayod for a smoother, faster, and more professional HR experience.
            </p>
          </div>
          <Link
            href="/register"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#1E1B4B] transition-all hover:bg-indigo-50 active:scale-95"
          >
            Start 14-Day Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div>
            <p className="font-[family-name:var(--font-poppins)] text-[22px] font-bold tracking-tight text-white">
              Kayod
            </p>
            <p className="mt-1 text-[13px] text-indigo-200">© 2026 Kayod HRIS. Built for modern teams.</p>
          </div>
          <div className="flex items-center gap-6 text-[15px] text-indigo-100">
            <Link className="transition-colors hover:text-white" href="/jobs">
              Jobs
            </Link>
            <Link className="transition-colors hover:text-white" href="/login">
              Login
            </Link>
            <Link className="transition-colors hover:text-white" href="/register">
              Register
            </Link>
            <a className="transition-colors hover:text-white" href="#features">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
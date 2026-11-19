"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Eye,
  EyeOff,
  FileText,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { login } from "../actions";

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: "AI-Powered Matching",
    description: "Discover roles ranked to your skills and experience.",
  },
  {
    icon: FileText,
    title: "Digital Offer Signing",
    description: "Review and sign employment offers cleanly online.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Portal",
    description: "Track applications, interviews, and schedules anywhere.",
  },
  {
    icon: CalendarClock,
    title: "Unified Attendance & Leave",
    description: "Seamless transition from candidate to onboarded team member.",
  },
];

export default function LoginPage() {
  return (
    <Suspense>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#FDF8F2]">
        <div className="absolute left-1/2 top-1/2 h-[1120px] w-[1120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] items-center justify-center py-2 sm:py-6">
        <LoginForm />
      </div>
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "";
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(login, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      router.replace("/dashboard");
    }
  }, [router, state.success]);

  const registerHref = next
    ? `/register/applicant?next=${encodeURIComponent(next)}`
    : "/register/applicant";

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl lg:grid-cols-12">
      {/* Left Panel: Transparent over Full-Page Cream + Rings, Frosted Glass Auth Card */}
      <div className="flex flex-col justify-center bg-transparent p-2 sm:p-6 lg:col-span-6 lg:p-8">
        <div className="flex flex-col justify-between rounded-3xl border border-white/80 bg-white/60 p-5 shadow-[0_8px_32px_rgba(30,27,75,0.06)] backdrop-blur-xl sm:p-7">
          <div className="space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center text-2xl font-bold tracking-tight text-[#1E1B4B]"
              >
                Kayod
              </Link>
              <Link
                href="/jobs"
                className="inline-flex min-h-[44px] items-center rounded-full bg-primary-light px-3.5 text-xs font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-100"
              >
                Browse jobs
              </Link>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E1B4B] sm:text-3xl">
                Welcome Back
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Log in to your Kayod account
              </p>
            </div>

            {(error || state.error) && (
              <div
                role="alert"
                className="rounded-2xl border border-error/25 bg-error-bg px-4 py-3 text-sm font-medium text-error"
              >
                {state.error || error}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="next" value={next} />

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-text-main">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-text-main">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="inline-flex min-h-[32px] items-center text-xs font-semibold text-primary transition-colors hover:text-primary-hover hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white py-2.5 pl-4 pr-12 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-[40px] w-[40px] -translate-y-1/2 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-main"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1E1B4B] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{pending ? "Logging in..." : "Log In"}</span>
                {!pending ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </form>
          </div>

          <div className="mt-5 border-t border-indigo-100/80 pt-4 text-center text-sm text-text-muted">
            New here?{" "}
            <Link
              href="/jobs"
              className="font-semibold text-[#1E1B4B] transition-colors hover:text-indigo-900 hover:underline"
            >
              Browse jobs
            </Link>{" "}
            or{" "}
            <Link
              href={registerHref}
              className="font-semibold text-[#1E1B4B] transition-colors hover:text-indigo-900 hover:underline"
            >
              create an account
            </Link>
          </div>
        </div>
      </div>

      {/* Right Panel: Branded Kayod Value Proposition (Desktop only) */}
      <div className="hidden flex-col justify-between bg-[#1E1B4B] p-10 text-on-primary lg:col-span-6 lg:flex">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-primary-fixed">
            <BadgeCheck className="h-4 w-4" />
            <span>Built for Philippine Teams &amp; Talent</span>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-on-primary">
              Hire smarter. Work better. Grow with Kayod.
            </h2>
            <p className="text-sm leading-relaxed text-primary-fixed-dim">
              From AI-assisted candidate matching to digital offer signing, attendance, and leave management — everything lives in one modern workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-2">
            {VALUE_PROPS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/10 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-on-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-on-primary">{item.title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-primary-fixed-dim">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5 text-xs text-primary-fixed-dim">
          <span>Trusted across Cebu, Manila &amp; remote PH teams</span>
          <span className="font-semibold text-on-primary">Kayod HRIS</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Eye,
  EyeOff,
  FileText,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { register } from "@/app/(auth)/actions";
import { safeNext } from "@/lib/safe-redirect";
import { PH_CITIES, PH_PROVINCES } from "@/lib/ph-locations";

export interface ProvinceOption {
  id: string;
  name: string;
}

export interface CityOption {
  id: string;
  name: string;
  province_id: string | null;
}

interface ApplicantRegisterFormProps {
  provinces?: ProvinceOption[];
  cities?: CityOption[];
}

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: "Smart Job Matching",
    description: "See how your skills align with open roles across the Philippines.",
  },
  {
    icon: FileText,
    title: "One-Click Resume Profile",
    description: "Upload your resume once and apply to verified employers in seconds.",
  },
  {
    icon: Briefcase,
    title: "Track Every Application",
    description: "Follow interview schedules, offers, and onboarding from your phone.",
  },
];

export default function ApplicantRegisterForm({
  provinces = [],
  cities = [],
}: ApplicantRegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "";
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);

  const computedAge = useMemo(() => {
    if (!dateOfBirth) return "";
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 0 ? String(age) : "";
  }, [dateOfBirth]);

  const isUnderage = computedAge !== "" && Number(computedAge) < 18;

  const [state, formAction, pending] = useActionState(register, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      router.replace(safeNext(next, "candidate"));
    }
  }, [next, router, state.success]);

  const effectiveProvinces = provinces.length > 0 ? provinces : PH_PROVINCES;
  const effectiveCities = cities.length > 0 ? cities : PH_CITIES;

  const filteredCities = useMemo(() => {
    if (!selectedProvinceId) return effectiveCities;
    return effectiveCities.filter((city) => city.province_id === selectedProvinceId);
  }, [effectiveCities, selectedProvinceId]);

  const selectedCityName = useMemo(() => {
    return effectiveCities.find((city) => city.id === selectedCityId)?.name ?? "";
  }, [effectiveCities, selectedCityId]);

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-white/80 shadow-[0_8px_32px_rgba(30,27,75,0.06)] lg:grid-cols-12">
      {/* Left Panel: Frosted Glass Registration Form */}
      <div className="flex flex-col justify-between bg-white/60 p-5 backdrop-blur-xl sm:p-8 lg:col-span-7 lg:p-10">
        <div className="space-y-5">
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
              Create Applicant Account
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Start applying to verified roles across the Philippines
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

          <form
            action={formAction}
            className="space-y-4"
            aria-label="Applicant registration form"
          >
            <input type="hidden" name="role" value="candidate" />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="country" value="Philippines" />
            <input type="hidden" name="city" value={selectedCityName} />
            <input type="hidden" name="privacy_consent_version" value="v1.0" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="first_name" className="block text-sm font-semibold text-text-main">
                  First name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  autoComplete="given-name"
                  placeholder="Juan"
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="last_name" className="block text-sm font-semibold text-text-main">
                  Last name
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  autoComplete="family-name"
                  placeholder="Dela Cruz"
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-text-main">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-semibold text-text-main">
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="09XXXXXXXXX"
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-semibold text-text-main">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="date_of_birth" className="block text-sm font-semibold text-text-main">
                  Date of Birth
                </label>
                <input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="age" className="block text-sm font-semibold text-text-main">
                  Age
                </label>
                <input
                  id="age"
                  name="age"
                  type="text"
                  readOnly
                  value={computedAge}
                  placeholder="Auto-calculated"
                  className={`min-h-[44px] w-full rounded-2xl border px-4 py-2.5 text-sm outline-none ${
                    isUnderage
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-indigo-100 bg-slate-50 text-text-main"
                  }`}
                />
                {isUnderage ? (
                  <p className="text-xs font-medium text-rose-600">
                    Must be at least 18 years old to register.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="gender" className="block text-sm font-semibold text-text-main">
                  Gender / Sex
                </label>
                <select
                  id="gender"
                  name="gender"
                  required
                  defaultValue=""
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                >
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="civil_status" className="block text-sm font-semibold text-text-main">
                  Civil Status
                </label>
                <select
                  id="civil_status"
                  name="civil_status"
                  required
                  defaultValue=""
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                >
                  <option value="" disabled>Select civil status</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="address" className="block text-sm font-semibold text-text-main">
                Street / Barangay Address
              </label>
              <input
                id="address"
                name="address"
                type="text"
                required
                autoComplete="street-address"
                placeholder="e.g. 123 Mabini St., Brgy. Poblacion"
                className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="province_id" className="block text-sm font-semibold text-text-main">
                  Province
                </label>
                <select
                  id="province_id"
                  name="province_id"
                  value={selectedProvinceId}
                  onChange={(e) => {
                    setSelectedProvinceId(e.target.value);
                    setSelectedCityId("");
                  }}
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                >
                  <option value="">Select province</option>
                  {effectiveProvinces.map((province) => (
                    <option key={province.id} value={province.id}>
                      {province.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="city_id" className="block text-sm font-semibold text-text-main">
                  City / Municipality
                </label>
                <select
                  id="city_id"
                  name="city_id"
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
                >
                  <option value="">Select city</option>
                  {filteredCities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="work_setup" className="block text-sm font-semibold text-text-main">
                Preferred work setup
              </label>
              <select
                id="work_setup"
                name="work_setup"
                defaultValue="remote"
                className="min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-text-main outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15"
              >
                <option value="remote">Remote</option>
                <option value="wfh">Work from home</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="resume_file" className="block text-sm font-semibold text-text-main">
                Resume <span className="font-normal text-text-muted">(optional, PDF or TXT)</span>
              </label>
              <label
                htmlFor="resume_file"
                className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-indigo-200 bg-white px-4 py-2.5 text-sm text-text-muted transition-colors hover:border-[#1E1B4B] hover:bg-[#EDE9F9]/40"
              >
                <span className="flex items-center gap-2 truncate">
                  <Upload className="h-4 w-4 shrink-0 text-[#1E1B4B]" />
                  <span className="truncate">
                    {resumeFileName || "Upload your resume to apply faster"}
                  </span>
                </span>
                <span className="shrink-0 rounded-xl bg-[#EDE9F9] px-2.5 py-1 text-xs font-semibold text-[#1E1B4B]">
                  Choose file
                </span>
              </label>
              <input
                id="resume_file"
                name="resume_file"
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => setResumeFileName(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-indigo-100 bg-white p-3.5 text-xs leading-relaxed text-text-muted">
              <input
                type="checkbox"
                name="privacy_consent"
                value="on"
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-indigo-200 accent-[#1E1B4B]"
              />
              <span>
                I agree to Kayod&apos;s Privacy Notice (v1.0) and consent to the processing of my profile and application details for recruitment.
              </span>
            </label>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1E1B4B] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{pending ? "Creating account..." : "Create Applicant Account"}</span>
              {!pending ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-indigo-100/80 pt-4 text-center text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Already have an account?{" "}
            <Link href={loginHref} className="font-semibold text-[#1E1B4B] hover:text-indigo-900 hover:underline">
              Log in
            </Link>
          </span>
          <span>
            Hiring for a team?{" "}
            <Link href="/register-choice" className="font-semibold text-[#1E1B4B] hover:text-indigo-900 hover:underline">
              Employer onboarding
            </Link>
          </span>
        </div>
      </div>

      {/* Right Panel: Branded Kayod Value Proposition (Desktop only) */}
      <div className="hidden flex-col justify-between bg-[#1E1B4B] p-10 text-on-primary lg:col-span-5 lg:flex">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-primary-fixed">
            <BadgeCheck className="h-4 w-4" />
            <span>For Job Seekers</span>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-on-primary">
              Your next role, simplified.
            </h2>
            <p className="text-sm leading-relaxed text-primary-fixed-dim">
              Create your candidate profile once, match with verified Philippine employers, and manage interviews and job offers in one place.
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

        <div className="mt-8 flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-primary-fixed-dim">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary-fixed" />
          <span>No government IDs required at sign-up</span>
        </div>
      </div>
    </div>
  );
}

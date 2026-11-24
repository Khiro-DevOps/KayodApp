"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { HR_ROLE_LABELS } from "@/lib/rbac/permissions";
import {
  acceptHrInviteAtomic,
  registerHrWorkspaceAtomic,
  validateHrInviteToken,
  type HrInviteValidationResult,
} from "./actions";

type HrRegisterFormClientProps = {
  inviteToken: string | null;
  inviteValidation: HrInviteValidationResult | null;
};

type ValidInvite = Extract<HrInviteValidationResult, { valid: true }>;

function extractInviteToken(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const param = parsed.searchParams.get("invite");
    if (param?.trim()) return param.trim();
  } catch {
    const match = trimmed.match(/[?&]invite=([^&#]+)/i);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]).trim();
      } catch {
        return match[1].trim();
      }
    }
  }

  return trimmed;
}

export default function HrRegisterFormClient({
  inviteToken,
  inviteValidation,
}: HrRegisterFormClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const isUrlInviteMode = Boolean(inviteToken);
  const initialValidInvite: ValidInvite | null =
    inviteValidation && inviteValidation.valid ? inviteValidation : null;

  // Create Workspace state (Light/Filled Panel)
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [address, setAddress] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Join via Invite state (Navy Blue Panel)
  const [inviteInput, setInviteInput] = useState(inviteToken ?? "");
  const [activeToken, setActiveToken] = useState<string | null>(
    initialValidInvite && inviteToken ? inviteToken : null
  );
  const [validInvite, setValidInvite] = useState<ValidInvite | null>(initialValidInvite);
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // If ?invite=<token> was passed in URL and is invalid/expired/used:
  // show "This invite link has expired" and DO NOT render Create New Workspace form.
  if (isUrlInviteMode && (!inviteValidation || !inviteValidation.valid)) {
    return (
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-[#1E1B4B] p-8 text-center text-white shadow-[0_8px_32px_rgba(30,27,75,0.16)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-200">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-white">
          This invite link has expired
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-indigo-200">
          {inviteValidation && !inviteValidation.valid
            ? inviteValidation.error
            : "This invite link has expired. Ask your HR Manager for a new link."}
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-white px-6 text-sm font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-50"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  async function handleValidateInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);

    const extracted = extractInviteToken(inviteInput);
    if (!extracted) {
      setInviteError("Paste your invite link or token first.");
      return;
    }

    setValidatingInvite(true);
    try {
      const result = await validateHrInviteToken(extracted);
      if (!result.valid) {
        setValidInvite(null);
        setActiveToken(null);
        setInviteError(result.error || "This invite link has expired.");
        return;
      }

      setActiveToken(extracted);
      setValidInvite(result);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Unable to validate invite token.");
    } finally {
      setValidatingInvite(false);
    }
  }

  async function handleAcceptInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);

    if (!validInvite || !activeToken) {
      setInviteError("Please validate an invite token first.");
      return;
    }

    if (invitePassword.length < 8) {
      setInviteError("Password must be at least 8 characters.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await acceptHrInviteAtomic({
        inviteToken: activeToken,
        firstName: inviteFirstName,
        lastName: inviteLastName,
        phone: invitePhone,
        password: invitePassword,
      });

      if (!res.success) {
        setInviteError(
          res.error || "This invite link has expired. Ask your HR Manager for a new link."
        );
        setInviteSubmitting(false);
        return;
      }

      await supabase.auth.signOut();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: validInvite.invitedEmail,
        password: invitePassword,
      });

      if (signInErr) {
        setInviteSuccess("Account created. Please sign in to continue.");
        router.push("/login");
        return;
      }

      router.replace("/hr");
      router.refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Unexpected registration error.");
      setInviteSubmitting(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);

    if (password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setCreateError("Passwords do not match.");
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await registerHrWorkspaceAtomic({
        companyName,
        industry,
        companySize,
        address,
        firstName,
        lastName,
        phone,
        email,
        password,
      });

      if (!res.success) {
        setCreateError(res.error || "Failed to create company workspace.");
        setCreateSubmitting(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInErr) {
        setCreateSuccess("Workspace created. Please sign in to continue.");
        router.push("/login");
        return;
      }

      router.replace("/hr");
      router.refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unexpected registration error.");
      setCreateSubmitting(false);
    }
  }

  const lightInputClass =
    "min-h-[44px] w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-[#1E1B4B] focus:bg-white focus:ring-2 focus:ring-[#1E1B4B]/15";

  const navyInputClass =
    "min-h-[44px] w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-indigo-200/70 outline-none transition-colors focus:border-white/50 focus:bg-white/15 focus:ring-2 focus:ring-white/20";

  const navyPanelContent = (
    <div className="flex flex-col justify-between bg-[#1E1B4B] p-6 text-on-primary sm:p-8 lg:p-10">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-primary-fixed">
            <UserPlus className="h-4 w-4" />
            <span>Join via Invite Link</span>
          </div>
          {isUrlInviteMode ? (
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-white hover:text-indigo-100"
            >
              Kayod
            </Link>
          ) : null}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-on-primary">
            {validInvite
              ? `Join ${validInvite.tenantName}`
              : "Join Existing Company"}
          </h2>
          <p className="text-sm leading-relaxed text-primary-fixed-dim">
            {validInvite
              ? "Your invite is verified. Complete your HR profile below to join your team."
              : "Have an invite link or token from your HR Manager? Paste it below to join their workspace."}
          </p>
        </div>

        {inviteError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-300/30 bg-red-500/20 px-4 py-3 text-sm font-medium text-red-100"
          >
            {inviteError}
          </div>
        ) : null}

        {inviteSuccess ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/20 px-4 py-3 text-sm font-medium text-emerald-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{inviteSuccess}</span>
          </div>
        ) : null}

        {!validInvite ? (
          <form onSubmit={handleValidateInvite} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="inviteTokenInput" className="block text-sm font-semibold text-white">
                Invite Link or Token
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-200" />
                <input
                  id="inviteTokenInput"
                  type="text"
                  required
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Paste invite URL or token"
                  className={`${navyInputClass} pl-10`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={validatingInvite}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {validatingInvite ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Validating invite...</span>
                </>
              ) : (
                <>
                  <span>Validate Invite</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">
                  Invited Company
                </p>
                <p className="text-sm font-semibold text-white">{validInvite.tenantName}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/30 bg-indigo-400/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-100">
                  You are joining as {HR_ROLE_LABELS[validInvite.invitedHrRole]}
                </span>
              </div>
              {!isUrlInviteMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setValidInvite(null);
                    setActiveToken(null);
                    setInviteError(null);
                  }}
                  className="text-xs font-semibold text-indigo-200 underline-offset-2 hover:text-white hover:underline"
                >
                  Change
                </button>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="inviteEmail" className="block text-sm font-semibold text-white">
                Invited Email
              </label>
              <input
                id="inviteEmail"
                type="email"
                readOnly
                value={validInvite.invitedEmail}
                className="min-h-[44px] w-full cursor-not-allowed rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-indigo-100 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="inviteFirstName" className="block text-sm font-semibold text-white">
                  First name *
                </label>
                <input
                  id="inviteFirstName"
                  type="text"
                  required
                  value={inviteFirstName}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  placeholder="First name"
                  className={navyInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inviteLastName" className="block text-sm font-semibold text-white">
                  Last name *
                </label>
                <input
                  id="inviteLastName"
                  type="text"
                  required
                  value={inviteLastName}
                  onChange={(e) => setInviteLastName(e.target.value)}
                  placeholder="Last name"
                  className={navyInputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invitePhone" className="block text-sm font-semibold text-white">
                Phone number <span className="font-normal text-indigo-200">(optional)</span>
              </label>
              <input
                id="invitePhone"
                type="tel"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="09XXXXXXXXX"
                className={navyInputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invitePassword" className="block text-sm font-semibold text-white">
                Password *
              </label>
              <div className="relative">
                <input
                  id="invitePassword"
                  type={showInvitePassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={`${navyInputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowInvitePassword((prev) => !prev)}
                  aria-label={showInvitePassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex h-[40px] w-[40px] -translate-y-1/2 items-center justify-center rounded-xl text-indigo-200 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {showInvitePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={inviteSubmitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviteSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Joining Workspace...</span>
                </>
              ) : (
                <>
                  <span>Join {validInvite.tenantName}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-2 border-t border-white/10 pt-5 text-xs text-primary-fixed-dim">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary-fixed" />
          <span>Invite tokens are single-use and time-limited</span>
        </span>
        {isUrlInviteMode ? (
          <Link href="/login" className="font-semibold text-white hover:underline">
            Log in
          </Link>
        ) : null}
      </div>
    </div>
  );

  // When ?invite=<token> was passed in the URL and is valid, render ONLY the invite form
  // (preventing invited staff from accidentally creating a separate tenant).
  if (isUrlInviteMode) {
    return (
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/80 shadow-[0_8px_32px_rgba(30,27,75,0.12)]">
        {navyPanelContent}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-white/80 shadow-[0_8px_32px_rgba(30,27,75,0.06)] lg:grid-cols-12">
      {/* Left Panel: Create New Company Workspace (Light/Filled Panel) */}
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
              href="/register/applicant"
              className="inline-flex min-h-[44px] items-center rounded-full bg-primary-light px-3.5 text-xs font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-100"
            >
              Applicant sign up
            </Link>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E1B4B] sm:text-3xl">
                Create Company Workspace
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Register your organization and primary HR Manager account.
              </p>
            </div>
          </div>

          {createError ? (
            <div
              role="alert"
              className="rounded-2xl border border-error/25 bg-error-bg px-4 py-3 text-sm font-medium text-error"
            >
              {createError}
            </div>
          ) : null}

          {createSuccess ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{createSuccess}</span>
            </div>
          ) : null}

          <form
            onSubmit={handleCreateWorkspace}
            className="space-y-4"
            aria-label="Create company workspace form"
          >
            <div className="space-y-1.5">
              <label htmlFor="companyName" className="block text-sm font-semibold text-text-main">
                Company name *
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter your company name"
                className={lightInputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="industry" className="block text-sm font-semibold text-text-main">
                  Industry
                </label>
                <input
                  id="industry"
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Engineering, Technology"
                  className={lightInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="companySize" className="block text-sm font-semibold text-text-main">
                  Company size
                </label>
                <select
                  id="companySize"
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className={lightInputClass}
                >
                  <option value="">Select size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="address" className="block text-sm font-semibold text-text-main">
                Address
              </label>
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, Country"
                className={lightInputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-sm font-semibold text-text-main">
                  First name *
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Juan"
                  className={lightInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-sm font-semibold text-text-main">
                  Last name *
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Dela Cruz"
                  className={lightInputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-text-main">
                  Work email *
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hr@company.com"
                  className={lightInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-semibold text-text-main">
                  Phone number <span className="font-normal text-text-muted">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  className={lightInputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-text-main">
                  Password *
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showCreatePassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={`${lightInputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    aria-label={showCreatePassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-[40px] w-[40px] -translate-y-1/2 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-main"
                  >
                    {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-text-main">
                  Confirm password *
                </label>
                <input
                  id="confirmPassword"
                  type={showCreatePassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className={lightInputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={createSubmitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1E1B4B] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Workspace...</span>
                </>
              ) : (
                <>
                  <span>Create Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-indigo-100/80 pt-4 text-center text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#1E1B4B] hover:text-indigo-900 hover:underline">
              Log in
            </Link>
          </span>
          <span>
            Looking for work?{" "}
            <Link
              href="/register/applicant"
              className="font-semibold text-[#1E1B4B] hover:text-indigo-900 hover:underline"
            >
              Applicant sign up
            </Link>
          </span>
        </div>
      </div>

      {/* Right Panel: Navy Blue Panel = Join Existing Company via Invite Link */}
      <div className="lg:col-span-5 flex">{navyPanelContent}</div>
    </div>
  );
}

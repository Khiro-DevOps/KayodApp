"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  acceptHrInviteAtomic,
  registerHrWorkspaceAtomic,
  type HrInviteValidationResult,
} from "./actions";

type HrRegisterFormClientProps = {
  inviteToken: string | null;
  inviteValidation: HrInviteValidationResult | null;
};

export default function HrRegisterFormClient({
  inviteToken,
  inviteValidation,
}: HrRegisterFormClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const isInviteMode = Boolean(inviteToken);
  const validInvite =
    inviteValidation && inviteValidation.valid ? inviteValidation : null;

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [address, setAddress] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(validInvite?.invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (isInviteMode && (!inviteValidation || !inviteValidation.valid)) {
    return (
      <div className="min-h-screen bg-[#f5f2fb] px-4 py-12 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-[#e6e1f4] bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1B21]">Invite Link Unavailable</h1>
          <p className="text-sm text-[#484551]">
            {inviteValidation && !inviteValidation.valid
              ? inviteValidation.error
              : "This invite link has expired. Ask your HR Manager for a new link."}
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#332477] px-5 text-sm font-semibold text-white hover:bg-[#4A3D8F]"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (isInviteMode && validInvite && inviteToken) {
        const res = await acceptHrInviteAtomic({
          inviteToken,
          firstName,
          lastName,
          phone,
          password,
        });

        if (!res.success) {
          setError(
            res.error || "This invite link has expired. Ask your HR Manager for a new link."
          );
          setSubmitting(false);
          return;
        }

        await supabase.auth.signOut();
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: validInvite.invitedEmail,
          password,
        });

        if (signInErr) {
          setSuccessMessage("Account created. Please sign in to continue.");
          router.push("/login");
          return;
        }

        router.replace("/hr");
        router.refresh();
        return;
      }

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
        setError(res.error || "Failed to create company workspace.");
        setSubmitting(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInErr) {
        setSuccessMessage("Workspace created. Please sign in to continue.");
        router.push("/login");
        return;
      }

      router.replace("/hr");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected registration error.");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-[#E8E6F8] bg-white px-3 py-2 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#9A98B3] focus:border-[#332477] focus:ring-1 focus:ring-[#DFDCFF]/50";

  return (
    <div className="min-h-screen bg-[#f5f2fb] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-[#d9d4ea] bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DFDCFF] text-[#332477]">
            {validInvite ? <UserPlus className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1B21]">
              {validInvite
                ? `Joining ${validInvite.tenantName} Workspace`
                : "Create New Company Workspace"}
            </h1>
            <p className="text-sm text-[#484551]">
              {validInvite
                ? "Complete your HR Manager profile to join your team's workspace."
                : "Register your organization and primary HR Manager account."}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-[#F4C6C6] bg-[#FFF3F3] px-3 py-2.5 text-sm text-[#B42318]">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!validInvite ? (
            <div className="space-y-4 rounded-xl border border-[#EFEComparable] bg-[#FAF8FF] p-4">
              <div>
                <label htmlFor="companyName" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                  Company Name *
                </label>
                <input
                  id="companyName"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="industry" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                    Industry
                  </label>
                  <input
                    id="industry"
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Engineering, Technology"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="companySize" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                    Company Size
                  </label>
                  <select
                    id="companySize"
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className={inputClass}
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

              <div>
                <label htmlFor="address" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                  Headquarters Address
                </label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Country"
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                First Name *
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                Last Name *
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                Work Email *
              </label>
              <input
                id="email"
                type="email"
                required
                readOnly={Boolean(validInvite)}
                value={validInvite ? validInvite.invitedEmail : email}
                onChange={(e) => {
                  if (!validInvite) setEmail(e.target.value);
                }}
                placeholder="hr@company.com"
                className={`${inputClass} ${validInvite ? "bg-slate-100 text-slate-600 cursor-not-allowed" : ""}`}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 900 000 0000"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                Password *
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-[#484551] mb-1">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className={inputClass}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <Link href="/login" className="text-sm font-medium text-[#332477] hover:underline">
              Already have an account? Sign in
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#332477] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4A3D8F] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{validInvite ? "Joining Workspace..." : "Creating Workspace..."}</span>
                </>
              ) : (
                <span>{validInvite ? `Join ${validInvite.tenantName}` : "Create Workspace"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

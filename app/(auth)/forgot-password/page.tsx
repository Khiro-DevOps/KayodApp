"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        "/reset-password"
      )}`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
    } catch {
      setError("Unable to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center py-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card-bg p-6 shadow-md sm:p-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center text-xl font-bold tracking-tight text-brand-navy"
          >
            Kayod
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-brand-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login
          </Link>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-text-main">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Enter your email and we&apos;ll send you a password reset link.
          </p>
        </div>

        {sent ? (
          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-success-bg p-5 text-sm text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">Check your inbox</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                  If an account exists for <span className="font-semibold">{email}</span>, we sent a password reset link.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-brand-navy px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light"
            >
              Return to Log In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-error/25 bg-error-bg px-4 py-3 text-sm font-medium text-error"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="reset-email" className="block text-sm font-semibold text-text-main">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg py-2.5 pl-10 pr-4 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:bg-card-bg focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending link..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

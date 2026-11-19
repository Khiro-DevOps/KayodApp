"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setUpdated(true);
      setTimeout(() => {
        router.replace("/login");
      }, 1500);
    } catch {
      setError("Unable to update password. Please request a new reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center py-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card-bg p-6 shadow-md sm:p-8">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-xl font-bold tracking-tight text-brand-navy"
        >
          Kayod
        </Link>

        <div className="mt-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-main">
            Set new password
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Choose a strong password for your Kayod account.
          </p>
        </div>

        {updated ? (
          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-success-bg p-5 text-sm text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">Password updated</p>
                <p className="mt-1 text-xs text-emerald-800">
                  Redirecting you to log in...
                </p>
              </div>
            </div>
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
              <label htmlFor="new-password" className="block text-sm font-semibold text-text-main">
                New password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg py-2.5 pl-10 pr-12 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:bg-card-bg focus:ring-2 focus:ring-primary/20"
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

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-text-main">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="min-h-[44px] w-full rounded-2xl border border-border bg-surface-bg py-2.5 pl-10 pr-4 text-sm text-text-main placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:bg-card-bg focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-brand-navy px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-navy-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

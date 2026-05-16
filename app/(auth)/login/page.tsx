"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useActionState, useEffect } from "react";
import { login } from "../actions";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [state, formAction, pending] = useActionState(login, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      router.replace("/dashboard");
    }
  }, [router, state.success]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
          Welcome Back
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Log in to your Kayod account
        </p>
      </div>

      {(error || state.error) && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
          {state.error || error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-text-primary">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          {pending ? "Logging in..." : "Log In"}
        </button>
      </form>

      <p className="text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:text-primary-dark">
          Sign up
        </Link>
      </p>
    </div>
  );
}


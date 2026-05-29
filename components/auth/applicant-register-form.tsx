"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useActionState } from "react";
import { register } from "@/app/(auth)/actions";

export default function ApplicantRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [state, formAction, pending] = useActionState(register, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      router.replace("/apply/jobs");
    }
  }, [router, state.success]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    // Split full name into first/last
    const full = (fd.get("full_name") as string) || "";
    const [first, ...rest] = full.trim().split(" ");
    const last = rest.join(" ") || "";
    fd.set("first_name", first);
    fd.set("last_name", last);
    fd.set("role", "candidate");

    // Ensure optional fields are present (server expects these keys)
    if (!fd.get("phone")) fd.set("phone", "");
    if (!fd.get("date_of_birth")) fd.set("date_of_birth", "");
    if (!fd.get("address")) fd.set("address", "");
    if (!fd.get("city")) fd.set("city", "");
    if (!fd.get("country")) fd.set("country", "Philippines");
    if (!fd.get("work_setup")) fd.set("work_setup", "remote");

    await formAction(fd as unknown as FormData);
  }

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
            Create Applicant Account
          </h1>
          <p className="mt-1 text-sm text-text-secondary">Quick applicant signup</p>
        </div>

        {(error || state.error) && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
            {state.error || error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4" aria-label="Applicant registration form">
          <div className="space-y-1">
            <label htmlFor="full_name" className="text-sm font-medium text-text-primary">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              placeholder="Jane Doe"
              aria-label="Full name"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

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
              aria-label="Email"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

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
              aria-label="Password"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="phone" className="text-sm font-medium text-text-primary">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="09XXXXXXXXX"
              aria-label="Phone"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="date_of_birth" className="text-sm font-medium text-text-primary">
              Date of birth
            </label>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              aria-label="Date of birth"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="address" className="text-sm font-medium text-text-primary">
              Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              placeholder="Street, Barangay, Building"
              aria-label="Address"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="city" className="text-sm font-medium text-text-primary">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                placeholder="Manila"
                aria-label="City"
                className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="country" className="text-sm font-medium text-text-primary">
                Country
              </label>
              <input
                id="country"
                name="country"
                type="text"
                defaultValue="Philippines"
                aria-label="Country"
                className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="work_setup" className="text-sm font-medium text-text-primary">
              Work setup preference
            </label>
            <select
              id="work_setup"
              name="work_setup"
              aria-label="Work setup"
              className="w-full rounded-[4px] border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="remote">Remote</option>
              <option value="wfh">Work from home</option>
              <option value="onsite">Onsite</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            {pending ? "Creating..." : "Create Applicant Account"}
          </button>
        </form>

        <p className="text-center text-sm text-text-secondary">
          Looking to hire talent? <Link href="/register" className="font-medium text-primary">Register as an Employer</Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense, type ChangeEvent } from "react";
import { register } from "../actions";

function formatPhilippinesPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits === "0") return "0";
  if (digits === "63") return "+63";

  let local = digits;
  if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else if (digits.startsWith("63")) {
    local = digits.slice(2);
  }

  local = local.slice(0, 10);

  if (!local) return digits;
  if (local.length <= 3) return `+63 ${local}`.trim();
  if (local.length <= 6) return `+63 ${local.slice(0, 3)} ${local.slice(3)}`;
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [role, setRole] = useState<"candidate" | "hr_manager">("candidate");
  const [phone, setPhone] = useState("");

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
          Create Account
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Join Kayod to start your journey
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form action={register} className="space-y-4">
        {/* Role Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            I am a...
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole("candidate")}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-sm font-medium transition-colors ${
                role === "candidate"
                  ? "border-primary bg-blue-50 text-primary"
                  : "border-border text-text-secondary hover:border-gray-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
              </svg>
              Job Seeker
            </button>
            <button
              type="button"
              onClick={() => setRole("hr_manager")}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-sm font-medium transition-colors ${
                role === "hr_manager"
                  ? "border-primary bg-blue-50 text-primary"
                  : "border-border text-text-secondary hover:border-gray-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path fillRule="evenodd" d="M4.5 2.25a.75.75 0 0 0 0 1.5v16.5h-.75a.75.75 0 0 0 0 1.5h16.5a.75.75 0 0 0 0-1.5h-.75V3.75a.75.75 0 0 0 0-1.5h-15ZM9 6a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5H9Zm-.75 3.75A.75.75 0 0 1 9 9h1.5a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75ZM9 12a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5H9Zm3.75-5.25A.75.75 0 0 1 13.5 6H15a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM13.5 9a.75.75 0 0 0 0 1.5H15a.75.75 0 0 0 0-1.5h-1.5Zm-.75 3.75a.75.75 0 0 1 .75-.75H15a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM9 19.5v-2.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v2.25H9Z" clipRule="evenodd" />
              </svg>
              HR Manager
            </button>
          </div>
          <input type="hidden" name="role" value={role} />
        </div>

        {/* First Name */}
        <div className="space-y-1">
          <label htmlFor="first_name" className="text-sm font-medium text-text-primary">
            First Name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            placeholder="Juan"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Last Name */}
        <div className="space-y-1">
          <label htmlFor="last_name" className="text-sm font-medium text-text-primary">
            Last Name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            placeholder="Dela Cruz"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Date of Birth */}
        <div className="space-y-1">
          <label htmlFor="date_of_birth" className="text-sm font-medium text-text-primary">
            Birthdate
          </label>
          <input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            required
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Age */}
        <div className="space-y-1">
          <label htmlFor="age" className="text-sm font-medium text-text-primary">
            Age
          </label>
          <input
            id="age"
            name="age"
            type="number"
            min={0}
            max={120}
            required
            placeholder="25"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Address */}
        <div className="space-y-1">
          <label htmlFor="address" className="text-sm font-medium text-text-primary">
            Address
          </label>
          <input
            id="address"
            name="address"
            type="text"
            required
            placeholder="House/Unit, Street, Barangay"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* City */}
        <div className="space-y-1">
          <label htmlFor="city" className="text-sm font-medium text-text-primary">
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            required
            placeholder="Quezon City"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Country */}
        <div className="space-y-1">
          <label htmlFor="country" className="text-sm font-medium text-text-primary">
            Country
          </label>
          <select
            id="country"
            name="country"
            defaultValue="Philippines"
            required
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="Philippines">Philippines</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Phone Number */}
        <div className="space-y-1">
          <label htmlFor="phone" className="text-sm font-medium text-text-primary">
            Phone Number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setPhone(formatPhilippinesPhone(event.target.value));
            }}
            required
            placeholder="+63 912 345 6789"
            maxLength={20}
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-text-secondary">
            Enter 11 digits (e.g. 09123456789) and it will format to +63 912 345 6789.
          </p>
        </div>
        {/* Company Name - Only for HR */}
          {role === "hr_manager" && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
              <label htmlFor="company_name" className="text-sm font-medium text-text-primary">
                Company Name
              </label>
              <input
                id="company_name"
                name="company_name"
                type="text"
                required={role === "hr_manager"}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
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
            minLength={6}
            placeholder="••••••••"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Create Account
        </button>
      </form>

      <p className="text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:text-primary-dark">
          Log in
        </Link>
      </p>
    </div>
  );
}
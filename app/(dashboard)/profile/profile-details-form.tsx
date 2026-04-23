"use client";

import { useState, type FormEvent } from "react";
import type { Profile } from "@/lib/types";

type Props = {
  profile: Profile | null;
};

function calculateAgeFromBirthdate(value: string): string {
  if (!value) return "";

  const birthdate = new Date(value);
  if (Number.isNaN(birthdate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  const dayDiff = today.getDate() - birthdate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < 0 || age > 120) return "";
  return String(age);
}

export default function ProfileDetailsForm({ profile }: Props) {
  const [age, setAge] = useState(() => {
    if (profile?.date_of_birth) return calculateAgeFromBirthdate(profile.date_of_birth);
    return "";
  });
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [country, setCountry] = useState(profile?.country ?? "Philippines");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  function onBirthdateChange(value: string) {
    setDateOfBirth(value);
    setAge(calculateAgeFromBirthdate(value));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Removed `age` — not a DB column, derived from date_of_birth
          date_of_birth: dateOfBirth || null,
          address,
          city,
          country,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error || "Failed to update profile");
        return;
      }

      setStatus("saved");
      setMessage("Profile details updated");
    } catch {
      setStatus("error");
      setMessage("Unexpected error while updating profile");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-surface border border-border p-4 space-y-4">
      <h2 className="font-medium text-text-primary">Personal Details</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="profile-date-of-birth" className="text-xs text-text-secondary">
            Birthdate
          </label>
          <input
            id="profile-date-of-birth"
            type="date"
            value={dateOfBirth}
            onChange={(event) => onBirthdateChange(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="profile-age" className="text-xs text-text-secondary">
            Age
          </label>
          <input
            id="profile-age"
            type="number"
            min={0}
            max={120}
            value={age}
            readOnly
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="profile-address" className="text-xs text-text-secondary">
          Address
        </label>
        <input
          id="profile-address"
          type="text"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="profile-city" className="text-xs text-text-secondary">
            City
          </label>
          <input
            id="profile-city"
            type="text"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="profile-country" className="text-xs text-text-secondary">
            Country
          </label>
          <input
            id="profile-country"
            type="text"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "saving" ? "Saving..." : "Save Details"}
        </button>
        {status !== "idle" && (
          <p
            className={`text-sm ${
              status === "error" ? "text-danger" : "text-text-secondary"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
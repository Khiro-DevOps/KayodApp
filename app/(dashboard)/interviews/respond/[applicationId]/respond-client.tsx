"use client";
// app/(dashboard)/interviews/respond/[applicationId]/respond-client.tsx

import { useState } from "react";
import Link from "next/link";
import type { InterviewType } from "@/lib/types";

interface Job {
  id: string;
  title: string;
  description: string;
  requirements?: string | null;
  location?: string | null;
  is_remote: boolean;
  employment_type: string;
  salary_min?: number | null;
  salary_max?: number | null;
  currency: string;
  required_skills?: string[] | null;
  departments?: { name: string } | null;
}

interface Props {
  applicationId: string;
  job: Job;
  offeredModes: InterviewType[];
  hrOfficeAddress: string | null;
  existingPreference: InterviewType | null;
  preferenceSetAt: string | null;
}

export function RespondClient({
  applicationId,
  job,
  offeredModes,
  hrOfficeAddress,
  existingPreference,
  preferenceSetAt,
}: Props) {
  const initialMode =
    existingPreference && offeredModes.includes(existingPreference)
      ? existingPreference
      : offeredModes[0] ?? null;

  const [selected, setSelected] = useState<InterviewType | null>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(Boolean(existingPreference));

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interviews/set-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, selectedMode: selected }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setConfirmed(true);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const deptName = job.departments?.name ?? "General";
  const preferenceLabel = selected === "online" ? "Online" : "In-Person";

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Link
          href="/applications"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          Interview Invitation
        </h1>
      </div>

      {/* Congratulations banner */}
      <div className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
        <span className="text-2xl">🎉</span>
        <div>
          <p className="text-sm font-semibold text-green-800">Congratulations! You&apos;ve been shortlisted.</p>
          <p className="text-xs text-green-700 mt-0.5">
            The hiring team reviewed your application and would like to invite you for an interview.
          </p>
        </div>
      </div>

      {/* Job Info Card */}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
        <div>
          <p className="text-xs text-text-secondary mb-0.5">{deptName}</p>
          <h2 className="text-base font-bold text-text-primary">{job.title}</h2>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          {job.location && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082C11.81 11.235 13 9.255 13 7A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.291 5.597a15.591 15.591 0 0 0 2.236 2.236l.012.008ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
              </svg>
              {job.location}{job.is_remote && " (Remote)"}
            </span>
          )}
          {job.salary_min && job.salary_max && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
              ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary capitalize">
            {job.employment_type.replace("_", " ")}
          </span>
        </div>

        {/* Description */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">About this role</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap line-clamp-4">{job.description}</p>
        </div>

        {/* Skills */}
        {job.required_skills && job.required_skills.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Required Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {job.required_skills.map((skill) => (
                <span key={skill} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preference Selection */}
      {confirmed ? (
        <div className="rounded-2xl bg-surface border border-border p-5 space-y-3 text-center">
          <div className="text-3xl">{selected === "online" ? "💻" : "🏢"}</div>
          <p className="text-sm font-semibold text-text-primary">
            You&apos;ve chosen: <span className="text-primary">{preferenceLabel} Interview</span>
          </p>
          <p className="text-xs text-text-secondary">
            The HR team has been notified and will schedule your interview shortly.
            You&apos;ll receive a notification once it&apos;s confirmed.
          </p>
          {preferenceSetAt && (
            <p className="text-xs text-text-tertiary">
              Submitted {new Date(preferenceSetAt).toLocaleDateString("en-PH", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit"
              })}
            </p>
          )}
          <button
            onClick={() => setConfirmed(false)}
            className="text-xs text-primary underline underline-offset-2"
          >
            Change preference
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Choose your interview format</p>
            <p className="text-xs text-text-secondary mt-0.5">
              HR has enabled the options below. Select the format you prefer and we&apos;ll schedule based on your choice.
            </p>
          </div>

          {offeredModes.length === 0 && (
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Interview format options are not configured yet. Please check back later.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Online option */}
            {offeredModes.includes("online") && (
              <button
                onClick={() => setSelected("online")}
                className={`rounded-2xl border-2 p-4 text-left transition-all ${
                  selected === "online"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-gray-50 hover:border-primary/40"
                }`}
              >
                <div className="text-2xl mb-2">💻</div>
                <p className="text-sm font-semibold text-text-primary">Online</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Video call via our built-in meeting room. Join from anywhere.
                </p>
                {selected === "online" && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="text-xs font-medium text-primary">Selected</span>
                  </div>
                )}
              </button>
            )}

            {/* In-person option */}
            {offeredModes.includes("in_person") && (
              <button
                onClick={() => setSelected("in_person")}
                className={`rounded-2xl border-2 p-4 text-left transition-all ${
                  selected === "in_person"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-gray-50 hover:border-primary/40"
                }`}
              >
                <div className="text-2xl mb-2">🏢</div>
                <p className="text-sm font-semibold text-text-primary">In-Person</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Visit our office. Address details will be included in the invite.
                </p>
                {hrOfficeAddress && (
                  <p className="mt-2 rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-text-secondary">
                    Default address: {hrOfficeAddress}
                  </p>
                )}
                {selected === "in_person" && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="text-xs font-medium text-primary">Selected</span>
                  </div>
                )}
              </button>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={!selected || loading || offeredModes.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Confirm Preference"}
          </button>
        </div>
      )}
    </div>
  );
}
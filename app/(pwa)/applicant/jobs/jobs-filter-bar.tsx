"use client";

import { useState } from "react";
import Link from "next/link";
import { PHILIPPINE_CITIES } from "@/lib/constants";

interface ResumeOption {
  id: string;
  title: string | null;
  created_at: string;
}

interface JobsFilterBarProps {
  resumes: ResumeOption[];
  selectedResumeId: string;
  initialQuery: string;
  initialPayMin: number | null;
  initialPayMax: number | null;
  initialLocation: string;
  initialWorkSetup: string;
}

export default function JobsFilterBar({
  resumes,
  selectedResumeId,
  initialQuery,
  initialPayMin,
  initialPayMax,
  initialLocation,
  initialWorkSetup,
}: JobsFilterBarProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilterCount = [
    initialPayMin !== null || initialPayMax !== null,
    Boolean(initialLocation && initialLocation !== "all"),
    Boolean(initialWorkSetup),
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Mobile: Single-row Search + Filters toggle + Compact Resume pill */}
      <form method="get" className="md:hidden space-y-2.5">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
          <div className="relative flex-1 min-w-0">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
              search
            </span>
            <input
              name="q"
              defaultValue={initialQuery}
              placeholder="Search jobs..."
              className="w-full rounded-xl bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              mobileFiltersOpen || activeFilterCount > 0
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            aria-expanded={mobileFiltersOpen}
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <button
            type="submit"
            className="shrink-0 rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            Go
          </button>
        </div>

        {/* Compact Resume selector pill on mobile */}
        <div className="flex items-center gap-2">
          <div className="relative inline-flex max-w-full items-center">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 text-[15px] text-purple-600">
              description
            </span>
            <select
              name="resume_id"
              defaultValue={selectedResumeId}
              aria-label="Select resume for matching"
              className="max-w-[240px] truncate rounded-full border border-purple-200 bg-purple-50/70 py-1.5 pl-8 pr-7 text-xs font-semibold text-purple-800 appearance-none focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
            >
              {resumes.length > 0 ? (
                resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title || new Date(resume.created_at).toLocaleDateString()}
                  </option>
                ))
              ) : (
                <option value="">No resumes</option>
              )}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-2 text-[15px] text-purple-600">
              expand_more
            </span>
          </div>
          {activeFilterCount > 0 || initialQuery ? (
            <Link
              href="/applicant/jobs"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </div>

        {/* Collapsible Mobile Filter Drawer */}
        {mobileFiltersOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Min Salary
                </label>
                <input
                  name="payMin"
                  defaultValue={initialPayMin ?? ""}
                  placeholder="Min ₱"
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-hidden"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Max Salary
                </label>
                <input
                  name="payMax"
                  defaultValue={initialPayMax ?? ""}
                  placeholder="Max ₱"
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Location
                </label>
                <select
                  name="location"
                  defaultValue={initialLocation || "all"}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="all">All Locations</option>
                  {PHILIPPINE_CITIES.map((city, idx) => (
                    <option key={`${city}-${idx}`} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Work Setup
                </label>
                <select
                  name="work_setup"
                  defaultValue={initialWorkSetup}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="">Any Setup</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                  <option value="wfh">WFH</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
              <button
                type="submit"
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        ) : null}
      </form>

      {/* Desktop: Single horizontal compact filter bar */}
      <form
        method="get"
        className="hidden md:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs"
      >
        <div className="relative min-w-[160px] flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            name="q"
            defaultValue={initialQuery}
            placeholder="Search role or keyword..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        <select
          name="resume_id"
          defaultValue={selectedResumeId}
          aria-label="Resume"
          className="max-w-[170px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-purple-500 focus:bg-white focus:outline-hidden"
        >
          {resumes.length > 0 ? (
            resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title || new Date(resume.created_at).toLocaleDateString()}
              </option>
            ))
          ) : (
            <option value="">No resumes</option>
          )}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            name="payMin"
            defaultValue={initialPayMin ?? ""}
            placeholder="Min ₱"
            type="number"
            aria-label="Minimum salary"
            className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:outline-hidden"
          />
          <span className="text-xs text-slate-400">-</span>
          <input
            name="payMax"
            defaultValue={initialPayMax ?? ""}
            placeholder="Max ₱"
            type="number"
            aria-label="Maximum salary"
            className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:outline-hidden"
          />
        </div>

        <select
          name="location"
          defaultValue={initialLocation || "all"}
          aria-label="Location"
          className="max-w-[150px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-purple-500 focus:bg-white focus:outline-hidden"
        >
          <option value="all">All Locations</option>
          {PHILIPPINE_CITIES.map((city, idx) => (
            <option key={`${city}-${idx}`} value={city}>
              {city}
            </option>
          ))}
        </select>

        <select
          name="work_setup"
          defaultValue={initialWorkSetup}
          aria-label="Work Setup"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-purple-500 focus:bg-white focus:outline-hidden"
        >
          <option value="">Any Setup</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
          <option value="wfh">WFH</option>
        </select>

        <button
          type="submit"
          className="shrink-0 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors shadow-xs"
        >
          Apply
        </button>

        {activeFilterCount > 0 || initialQuery ? (
          <Link
            href="/applicant/jobs"
            className="shrink-0 px-2 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Reset
          </Link>
        ) : null}
      </form>
    </div>
  );
}

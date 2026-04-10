"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PageContainer from "@/components/ui/page-container";
import { createJob } from "../../actions";

export default function NewJobPage() {
  return (
    <Suspense>
      <NewJobForm />
    </Suspense>
  );
}

function NewJobForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <a
            href="/jobs/manage"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </a>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Post New Job
          </h1>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={createJob} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium text-text-primary">
              Job Title *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Frontend Developer"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium text-text-primary">
              Description *
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={5}
              placeholder="Describe the role, responsibilities, and what the job entails..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="requirements" className="text-sm font-medium text-text-primary">
              Requirements
            </label>
            <textarea
              id="requirements"
              name="requirements"
              rows={3}
              placeholder="List qualifications, experience, and education needed..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="skills" className="text-sm font-medium text-text-primary">
              Skills
            </label>
            <input
              id="skills"
              name="skills"
              type="text"
              placeholder="React, TypeScript, Node.js (comma-separated)"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="location" className="text-sm font-medium text-text-primary">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="e.g. Manila, Remote"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="salary_range" className="text-sm font-medium text-text-primary">
                Salary Range
              </label>
              <input
                id="salary_range"
                name="salary_range"
                type="text"
                placeholder="e.g. 30k-50k"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Post Job
          </button>
        </form>
      </div>
    </PageContainer>
  );
}

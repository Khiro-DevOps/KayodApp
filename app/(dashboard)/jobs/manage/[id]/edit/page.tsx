"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import PageContainer from "@/components/ui/page-container";
import { updateJob } from "../../../actions";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { JobPosting } from "@/lib/types";

export default function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <EditJobForm jobId={id} />
    </Suspense>
  );
}

function EditJobForm({ jobId }: { jobId: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJob() {
      const supabase = createClient();
      const { data } = await supabase
        .from("job_postings")
        .select("*")
        .eq("id", jobId)
        .single<JobPosting>();
      setJob(data);
      setLoading(false);
    }
    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-16 bg-gray-200 rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (!job) {
    return (
      <PageContainer>
        <p className="text-sm text-text-secondary">Job not found.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <a
            href={`/jobs/manage/${jobId}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </a>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Edit Job
          </h1>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={updateJob} className="space-y-4">
          <input type="hidden" name="job_id" value={job.id} />

          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium text-text-primary">
              Job Title *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={job.title}
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
              defaultValue={job.description}
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
              defaultValue={job.requirements || ""}
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
              defaultValue={job.required_skills?.join(", ") || ""}
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
                defaultValue={job.location || ""}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="salary_min" className="text-sm font-medium text-text-primary">
                Salary Min
              </label>
              <input
                id="salary_min"
                name="salary_min"
                type="number"
                defaultValue={job.salary_min || ""}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="salary_max" className="text-sm font-medium text-text-primary">
                Salary Max
              </label>
              <input
                id="salary_max"
                name="salary_max"
                type="number"
                defaultValue={job.salary_max || ""}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="is_published" className="text-sm font-medium text-text-primary">
              Status
            </label>
            <select
              id="is_published"
              name="is_published"
              defaultValue={job.is_published ? "true" : "false"}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Save Changes
          </button>
        </form>
      </div>
    </PageContainer>
  );
}

// ============================================================
// SAVE THIS AS: app/(dashboard)/jobs/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobPosting, Profile } from "@/lib/types";
import Link from "next/link";

export default async function JobsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (isHR) redirect("/jobs/manage");

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("*, departments(name)")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return (
    <PageContainer>
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          Browse Jobs
        </h1>

        {!jobs || jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary">
              No jobs available right now. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job: JobPosting) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function JobCard({ job }: { job: JobPosting }) {
  const dept = job.departments as unknown as { name: string } | null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-2xl bg-surface border border-border p-4 space-y-2 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-text-primary text-sm truncate">
            {job.title}
          </h3>
          <p className="text-xs text-text-secondary">
            {dept?.name ?? "General"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 capitalize">
          {job.employment_type.replace("_", " ")}
        </span>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2">
        {job.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {job.location && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            📍 {job.location}
            {job.is_remote && " (Remote)"}
          </span>
        )}
        {job.salary_min && job.salary_max && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
          </span>
        )}
        {job.required_skills?.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {skill}
          </span>
        ))}
      </div>

      <p className="text-xs text-text-tertiary">
        Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        {job.closes_at && ` · Closes ${new Date(job.closes_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
      </p>
    </Link>
  );
}
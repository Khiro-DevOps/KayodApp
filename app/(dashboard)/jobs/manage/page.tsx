import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobListing } from "@/lib/types";

export default async function EmployerJobsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const { data: jobs } = await supabase
    .from("job_listings")
    .select("*")
    .eq("employer_id", employer.id)
    .order("created_at", { ascending: false });

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            My Jobs
          </h1>
          <a
            href="/jobs/manage/new"
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            + New Job
          </a>
        </div>

        {!jobs || jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {jobs.map((job: JobListing) => (
              <EmployerJobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function EmployerJobCard({ job }: { job: JobListing }) {
  return (
    <a
      href={`/jobs/manage/${job.id}`}
      className="block rounded-2xl bg-surface border border-border p-4 space-y-2 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-text-primary text-sm">{job.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            job.status === "active"
              ? "bg-green-50 text-success"
              : "bg-gray-100 text-text-secondary"
          }`}
        >
          {job.status}
        </span>
      </div>
      {job.location && (
        <p className="text-xs text-text-secondary">{job.location}</p>
      )}
      <p className="text-xs text-text-secondary">
        Posted {new Date(job.created_at).toLocaleDateString()}
      </p>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-text-secondary mb-3">
        You haven&apos;t posted any jobs yet.
      </p>
      <a
        href="/jobs/manage/new"
        className="inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        Post Your First Job
      </a>
    </div>
  );
}

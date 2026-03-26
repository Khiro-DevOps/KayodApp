import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { deleteJob } from "../../actions";
import type { JobListing } from "@/lib/types";
import Link from "next/link";

export default async function JobDetailManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("job_listings")
    .select("*, employers(*)")
    .eq("id", id)
    .single<JobListing>();

  if (!job) notFound();

  // Count applicants
  const { count: applicantCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("job_listing_id", id);

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/jobs/manage"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
            {job.title}
          </h1>
        </div>

        {/* Status + Meta */}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              job.status === "active"
                ? "bg-green-50 text-success"
                : "bg-gray-100 text-text-secondary"
            }`}
          >
            {job.status}
          </span>
          <span className="text-xs text-text-secondary">
            {applicantCount || 0} applicant{applicantCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Job Details Card */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Description</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{job.description}</p>
          </div>

          {job.requirements && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Requirements</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{job.requirements}</p>
            </div>
          )}

          {job.skills && job.skills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(job.location || job.salary_range) && (
            <div className="flex gap-4">
              {job.location && (
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-1">Location</p>
                  <p className="text-sm text-text-primary">{job.location}</p>
                </div>
              )}
              {job.salary_range && (
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-1">Salary</p>
                  <p className="text-sm text-text-primary">{job.salary_range}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href={`/jobs/manage/${job.id}/applicants`}
            className="flex items-center justify-between rounded-2xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            View Applicants ({applicantCount || 0})
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="flex gap-3">
            <Link
              href={`/jobs/manage/${job.id}/edit`}
              className="flex-1 rounded-2xl bg-primary py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Edit Job
            </Link>
            <form action={deleteJob} className="flex-1">
              <input type="hidden" name="job_id" value={job.id} />
              <button
                type="submit"
                className="w-full rounded-2xl border border-danger py-3 text-sm font-medium text-danger transition-colors hover:bg-red-50"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

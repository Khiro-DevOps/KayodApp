import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobListing } from "@/lib/types";
import Link from "next/link";

export default async function JobDetailsPage({
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
    .select("*, employers(company_name)")
    .eq("id", id)
    .single<JobListing>();

  if (!job) notFound();

  // Check if user already applied
  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("job_listing_id", id)
    .maybeSingle();

  const hasApplied = !!existingApplication;

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isJobSeeker = profile?.role === "job_seeker";

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              {job.title}
            </h1>
            {job.employers && (
              <p className="text-sm text-text-secondary">
                {(job.employers as unknown as { company_name: string }).company_name}
              </p>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-2">
          {job.location && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.291 5.597a15.591 15.591 0 0 0 2.236 2.236l.012.008ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
              </svg>
              {job.location}
            </span>
          )}
          {job.salary_range && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
              {job.salary_range}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
            {new Date(job.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Job Content */}
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
        </div>

        {/* Actions for Job Seekers */}
        {isJobSeeker && (
          <div className="space-y-2">
            {hasApplied ? (
              <div className="rounded-2xl bg-green-50 border border-green-200 py-3 text-center text-sm font-medium text-success">
                Already Applied
              </div>
            ) : (
              <Link
                href={`/jobs/${job.id}/apply`}
                className="block rounded-2xl bg-primary py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                Apply Now
              </Link>
            )}
            <Link
              href={`/jobs/${job.id}/tailor`}
              className="flex items-center justify-center gap-2 rounded-2xl border border-primary py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
              </svg>
              Tailor Resume with AI
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

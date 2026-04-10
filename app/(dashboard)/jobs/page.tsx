import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobListing, Profile } from "@/lib/types";
import Link from "next/link";

export default async function JobsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  // Employers see their management page
  if (profile?.role === "employer") {
    redirect("/jobs/manage");
  }

  // Job seekers see all active jobs
  const { data: jobs } = await supabase
    .from("job_listings")
    .select("*, employers(company_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <PageContainer>
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          Browse Jobs
        </h1>

        {/* Search */}
        <SearchBar />

        {!jobs || jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary">
              No jobs available right now. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job: JobListing) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function JobCard({ job }: { job: JobListing }) {
  const companyName =
    (job.employers as unknown as { company_name: string })?.company_name ??
    "Company";

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
          <p className="text-xs text-text-secondary">{companyName}</p>
        </div>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2">
        {job.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {job.location && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.291 5.597a15.591 15.591 0 0 0 2.236 2.236l.012.008ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
            </svg>
            {job.location}
          </span>
        )}
        {job.salary_range && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            {job.salary_range}
          </span>
        )}
        {job.skills &&
          job.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {skill}
            </span>
          ))}
      </div>
    </Link>
  );
}

function SearchBar() {
  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="text"
        placeholder="Search jobs..."
        className="w-full rounded-xl border border-border pl-10 pr-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        disabled
      />
    </div>
  );
}

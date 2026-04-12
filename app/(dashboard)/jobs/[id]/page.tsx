import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobPosting, Profile } from "@/lib/types";
import Link from "next/link";
import ApplyActions from "./apply-actions-client";

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
    .from("job_postings")
    .select("*, departments(name)")
    .eq("id", id)
    .single<JobPosting>();

  if (!job) notFound();

  // Check if user already applied
  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id, match_score")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", id)
    .maybeSingle();

  const hasApplied = !!existingApplication;
  const matchScore = existingApplication?.match_score as number | null;

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isCandidate = profile?.role === "candidate";

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
            <p className="text-sm text-text-secondary">
              {(job.departments as unknown as { name: string } | null)?.name ?? "General"}
            </p>
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
              {job.is_remote && " (Remote)"}
            </span>
          )}
          {job.salary_min && job.salary_max && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
              ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
            {job.employment_type.replace("_", " ")}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-text-secondary">
            Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
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

          {job.required_skills && job.required_skills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills.map((skill) => (
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

        {/* Actions for Candidates */}
        {isCandidate && (
          <ApplyActions
            jobId={job.id}
            hasApplied={hasApplied}
            matchScore={matchScore}
          />
        )}
      </div>
    </PageContainer>
  );
}

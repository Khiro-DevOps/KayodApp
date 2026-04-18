import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobPosting, Resume } from "@/lib/types";
import Link from "next/link";
import { submitApplication } from "@/app/(dashboard)/applications/actions";
import ApplyFormClient from "./apply-form-client";

export default async function ApplyPage({
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

  // Verify job seeker
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "candidate") redirect("/dashboard");

  // Fetch job
  const { data: job } = await supabase
    .from("job_postings")
    .select("*, departments(name)")
    .eq("id", id)
    .eq("is_published", true)
    .single<JobPosting>();

  if (!job) notFound();

  // Check if already applied
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", id)
    .maybeSingle();

  if (existing) {
    redirect(`/jobs/${id}?already_applied=true`);
  }

  // Fetch user's resumes
  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  const companyName = job.departments
    ? (job.departments as unknown as { name: string }).name
    : null;

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/${id}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              Apply
            </h1>
          </div>
        </div>

        {/* Job Summary */}
        <div className="rounded-2xl bg-surface border border-border p-4">
          <p className="text-sm font-medium text-text-primary">{job.title}</p>
          {companyName && (
            <p className="text-xs text-text-secondary mt-0.5">{companyName}</p>
          )}
          {job.location && (
            <p className="text-xs text-text-secondary mt-0.5">{job.location}</p>
          )}
        </div>

        {/* Apply Form */}
        <ApplyFormClient
          jobId={id}
          resumes={resumes || []}
          submitAction={submitApplication}
        />
      </div>
    </PageContainer>
  );
}

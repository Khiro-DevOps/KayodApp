import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { JobPosting, Resume } from "@/lib/types";
import { submitApplication } from "@/app/(dashboard)/hr/applicants/actions";
import ApplyFormClient from "@/app/(dashboard)/jobs/[id]/apply/apply-form-client";

export default async function ApplicantApplyPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "candidate") redirect("/applicant/dashboard");

  const { data: job } = await supabase
    .from("job_postings")
    .select("*, departments(name)")
    .eq("id", id)
    .eq("is_published", true)
    .single<JobPosting>();

  if (!job) notFound();

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", id)
    .maybeSingle();

  if (existing) {
    redirect(`/applicant/jobs/${id}?already_applied=true`);
  }

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/applicant/jobs/${id}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card-bg text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-main"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-text-main">Apply</h1>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card-bg p-4">
        <p className="text-sm font-semibold text-text-main">{job.title}</p>
        {companyName && (
          <p className="mt-0.5 text-xs text-text-muted">{companyName}</p>
        )}
        {job.location && (
          <p className="mt-0.5 text-xs text-text-muted">{job.location}</p>
        )}
      </div>

      <ApplyFormClient
        jobId={id}
        resumes={resumes || []}
        submitAction={submitApplication}
      />
    </div>
  );
}

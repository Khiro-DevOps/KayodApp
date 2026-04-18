import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobListing, Resume, TailoredResume } from "@/lib/types";
import Link from "next/link";
import TailorClient from "./tailor-client";

export default async function TailorResumePage({
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
    .select("*")
    .eq("id", id)
    .single<JobListing>();

  if (!job) notFound();

  // Fetch user's resumes (only those with extracted text)
  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", user.id)
    .not("content_text", "is", null)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  // Fetch existing tailor versions for this job from resume_versions
  // (replaces the old `tailored_resumes` query)
  const { data: tailoredResumes } = await supabase
    .from("resume_versions")
    .select(
      `
      id,
      resume_id,
      version_number,
      content_text,
      generated_content,
      created_at,
      resumes ( id, title )
    `
    )
    // Only versions whose parent resume belongs to the current user
    .eq("resumes.candidate_id", user.id)
    .eq("job_listing_id", id)
    .eq("change_source", "tailor")
    .order("created_at", { ascending: false });

  const normalizedTailored: TailoredResume[] = (tailoredResumes ?? []).map((version) => {
    const generated = (version.generated_content ?? {}) as Record<string, unknown>;
    const keywords = Array.isArray(generated.keywords)
      ? generated.keywords.filter((value): value is string => typeof value === "string")
      : [];

    return {
      id: version.id,
      tailored_text: typeof version.content_text === "string" ? version.content_text : "",
      keywords,
      created_at: version.created_at,
    };
  });

  const companyName = job.employers
    ? (job.employers as unknown as { company_name: string }).company_name
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
              AI Resume Tailor
            </h1>
          </div>
        </div>

        {/* Job Summary */}
        <div className="rounded-2xl bg-surface border border-border p-4">
          <p className="text-sm font-medium text-text-primary">{job.title}</p>
          {companyName && (
            <p className="text-xs text-text-secondary mt-0.5">{companyName}</p>
          )}
        </div>

        <TailorClient
          jobId={id}
          resumes={resumes || []}
          existingTailored={normalizedTailored}
        />
      </div>
    </PageContainer>
  );
}
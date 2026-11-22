import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { effectiveRole } from "@/lib/roles";
import type { JobPosting, Profile, Resume } from "@/lib/types";
import JobDetailContent from "@/components/jobs/job-detail-content";
import { computeCanonicalJobMatch } from "@/lib/match-scoring";

export default async function ApplicantJobDetailsPage({
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
    .select("*, tenant:tenants(name)")
    .eq("id", id)
    .single<JobPosting>();

  if (!job) notFound();

  const { data: existingApplication } = await supabase
    .from("job_applications")
    .select("id, match_score")
    .eq("applicant_id", user.id)
    .eq("job_id", id)
    .maybeSingle();

  const hasApplied = !!existingApplication;

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, city_id, province_id, work_setup, city")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "city_id" | "province_id" | "work_setup" | "city">>();

  const role = effectiveRole(profile?.role, authRole);
  const isCandidate = role === "candidate";

  let matchScore = (existingApplication?.match_score as number | null) ?? null;

  if (matchScore === null && isCandidate) {
    const { data: resumes } = await supabase
      .from("resumes")
      .select("*")
      .eq("candidate_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<Resume[]>();

    const primaryResume = resumes?.[0] ?? null;
    if (primaryResume) {
      matchScore = computeCanonicalJobMatch({
        resume: primaryResume,
        job,
        candidate: {
          city_id: profile?.city_id ?? null,
          province_id: profile?.province_id ?? null,
          preferred_work_setup: profile?.work_setup ?? null,
          location: profile?.city ?? null,
        },
      }).score;
    }
  }

  return (
    <JobDetailContent
      job={job}
      hasApplied={hasApplied}
      matchScore={matchScore}
      isCandidate={isCandidate}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { effectiveRole } from "@/lib/roles";
import type { JobPosting, Profile } from "@/lib/types";
import JobDetailContent from "@/components/jobs/job-detail-content";

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
    .select("*")
    .eq("id", id)
    .single<JobPosting>();

  if (!job) notFound();

  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id, match_score")
    .eq("candidate_id", user.id)
    .eq("job_posting_id", id)
    .maybeSingle();

  const hasApplied = !!existingApplication;
  const matchScore = existingApplication?.match_score as number | null;

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isCandidate = role === "candidate";

  return (
    <JobDetailContent
      job={job}
      hasApplied={hasApplied}
      matchScore={matchScore}
      isCandidate={isCandidate}
    />
  );
}

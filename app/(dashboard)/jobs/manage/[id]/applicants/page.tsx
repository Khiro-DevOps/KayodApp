import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import ApplicantsListClient from "./applicants-list-client";
import type { Application, Interview, Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function ApplicantsPage({
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

  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  if (!isHR) redirect("/dashboard");

  // Verify job exists
  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!job) notFound();

  // Fetch applicants with full details
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      candidate_id,
      status,
      match_score,
      submitted_at,
      cover_letter,
      profiles (id, first_name, last_name, email, phone, city, country),
      resumes (id, title, pdf_url, content_text)
    `)
    .eq("job_posting_id", id)
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("submitted_at", { ascending: false })
    .returns<Application[]>();

  // Fetch interviews for all applications on this job
  const applicationIds = applications?.map((a) => a.id) || [];
  const { data: interviews } = applicationIds.length
    ? await supabase
        .from("interviews")
        .select("*")
        .in("application_id", applicationIds)
        .returns<Interview[]>()
    : { data: [] as Interview[] };

  const interviewMap = new Map(
    (interviews || []).map((i) => [i.application_id, i])
  );

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${id}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              Applicants
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        {/* Applicants Count */}
        <p className="text-sm text-text-secondary">
          {applications?.length || 0} applicant{applications?.length !== 1 ? "s" : ""}
        </p>

        {/* Applicants List - Client Component */}
        <ApplicantsListClient 
          jobId={id}
          applications={applications || []} 
          interviews={interviewMap}
        />
      </div>
    </PageContainer>
  );
}

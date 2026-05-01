import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";
import ReviewBoardClient from "./review-board-client";

export default async function ReviewBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = user.user_metadata?.role as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!job) redirect("/jobs/manage");

  // Fetch all under_review applicants for this job
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id,
      status,
      match_score,
      submitted_at,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email ),
      resumes ( id, title )
    `)
    .eq("job_posting_id", id)
    .eq("status", "under_review")
    .order("match_score", { ascending: false, nullsFirst: false });

  const applicationIds = (applications as any[])?.map((a) => a.id) ?? [];

  // Fetch interviews for these applications
  const { data: interviews } = applicationIds.length
    ? await supabase
        .from("interviews")
        .select("id, application_id, scheduled_at, interview_type, status")
        .in("application_id", applicationIds)
    : { data: [] };

  // Fetch interview notes for these interviews
  const interviewIds = interviews?.map((i) => i.id) ?? [];
  const { data: notes } = interviewIds.length
    ? await supabase
        .from("interview_notes")
        .select("*")
        .in("interview_id", interviewIds)
    : { data: [] };

  // Build lookup maps
  const interviewByApp = new Map(
    (interviews ?? []).map((i) => [i.application_id, i])
  );
  const notesByInterview = new Map(
    (notes ?? []).map((n) => [n.interview_id, n])
  );

  // Merge everything into one list
  const candidates = ((applications as any[]) ?? []).map((app) => {
    const interview = interviewByApp.get(app.id);
    const note = interview ? notesByInterview.get(interview.id) : null;
    return { app, interview, note };
  });

  return (
    <PageContainer>
      <div className="space-y-5">
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
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              Review Board
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>{candidates.length} applicant{candidates.length !== 1 ? "s" : ""} on hold</strong> — compare interview notes, then move candidates to negotiation or reject them.
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-text-primary">No candidates on hold</p>
            <p className="text-xs text-text-secondary">
              Candidates appear here after you complete an interview and save your notes.
            </p>
            <Link
              href={`/jobs/manage/${id}/applicants`}
              className="inline-block mt-2 text-xs text-primary underline underline-offset-2"
            >
              View all applicants
            </Link>
          </div>
        ) : (
          <ReviewBoardClient jobId={id} candidates={candidates} />
        )}
      </div>
    </PageContainer>
  );
}
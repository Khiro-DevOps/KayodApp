import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ApplicationsClient from "./applications-client";
import PageContainer from "@/components/ui/page-container";
import type { Profile, Interview } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";

type CandidateApplicationListItem = {
  id: string;
  job_posting_id: string;
  status: string;
  submitted_at: string;
  match_score: number | null;
  job_postings: {
    id: string;
    title: string;
    location: string | null;
  }[] | null;
};

type CandidateInterviewListItem = {
  id: string;
  application_id: string;
  interview_type: "online" | "in_person";
  status: Interview["status"];
  scheduled_at: string;
  interviewer_notes: string | null;
};

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // HR manager routes to the dedicated management area.
  if (isHR) {
    redirect("/jobs/manage");
  }

  // Job Seeker view - show their own applications
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id,
      job_posting_id,
      status,
      submitted_at,
      match_score,
      job_postings ( id, title, location )
    `)
    .eq("candidate_id", user.id)
    .order("submitted_at", { ascending: false })
    .returns<CandidateApplicationListItem[]>();

  // Fetch interviews map
  const applicationIds = (applications ?? []).map((app) => app.id);
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, application_id, interview_type, status, scheduled_at, interviewer_notes")
    .in("application_id", applicationIds)
    .returns<CandidateInterviewListItem[]>();

  const interviewMap: Record<string, CandidateInterviewListItem> = {};
  (interviews ?? []).forEach((interview) => {
    interviewMap[interview.application_id] = interview;
  });

  return (
    <PageContainer>
      <div className="space-y-6">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          My Applications
        </h1>

        {!applications || applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary">
              You haven&apos;t applied to any jobs yet. Browse available positions to get started.
            </p>
          </div>
        ) : (
          <ApplicationsClient
            applications={applications ?? []}
            interviewMap={interviewMap}
          />
        )}
      </div>
    </PageContainer>
  );
}
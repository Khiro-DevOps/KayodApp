import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ManageJobsPage from "../jobs/manage/page";
import ApplicationsClient from "./applications-client";
import PageContainer from "@/components/ui/page-container";
import type { Profile, Application, Interview } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role ?? user.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // HR Manager view - use a single management page
  if (isHR) {
    return <ManageJobsPage />;
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
    .order("submitted_at", { ascending: false });

  // Fetch interviews map
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, application_id, scheduled_at, notes");

  const interviewMap: Record<string, Interview> = {};
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
            applications={applications as Application[]}
            interviewMap={interviewMap}
          />
        )}
      </div>
    </PageContainer>
  );
}
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HRApplicationsPage from "./hr-applications-page";
import ApplicationsClient from "./applications-client";
import PageContainer from "@/components/ui/page-container";
import type { Profile, Application, Interview } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata as any)?.role ?? ((user as any).raw_user_meta_data as any)?.role;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);

  // HR Manager view - show all applications
  if (isHR) {
    return <HRApplicationsPage />;
  }

  // Job Seeker view - show their own applications
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, status, match_score, created_at, submitted_at,
      job_listing_id,
      job_listings ( id, title, location, employers ( company_name ) )
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
              You haven't applied to any jobs yet. Browse available positions to get started.
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
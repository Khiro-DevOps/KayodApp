import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import ScheduleInterviewClient from "./schedule-interview-client";

interface PageProps {
  searchParams: Promise<{ applicationId?: string; application_id?: string }>;
}

export default async function ScheduleInterviewPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role as string | undefined) ?? null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Profile>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/hr");

  const resolvedParams = await searchParams;
  const applicationId = resolvedParams.applicationId ?? resolvedParams.application_id ?? null;

  let application: {
    id: string;
    status: string;
    candidate_id: string;
    profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
    job_postings: { id: string; title: string | null } | null;
  } | null = null;

  let fetchError: string | null = null;

  if (applicationId) {
    const { data, error } = await supabase
      .from("applications")
      .select(`
        id, status, candidate_id,
        profiles!applications_candidate_id_fkey ( first_name, last_name, email ),
        job_postings ( id, title )
      `)
      .eq("id", applicationId)
      .maybeSingle();

    if (error) {
      fetchError = error.message;
    } else if (!data) {
      fetchError = "Application not found or you do not have access to it.";
    } else {
      application = data as unknown as typeof application;
    }
  } else {
    fetchError = "Missing application ID. Open this page from an applicant card.";
  }

  return (
    <ScheduleInterviewClient
      application={application}
      error={fetchError}
    />
  );
}
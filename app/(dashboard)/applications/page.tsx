import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Application, Interview } from "@/lib/types";
import Link from "next/link";
import ApplicationsClient from "./applications-client";

export default async function ApplicationsPage() {
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

  // Employers don't have applications, redirect to manage
  if (profile?.role === "employer") redirect("/jobs/manage");

  // Fetch applications with job details
  const { data: applications } = await supabase
    .from("applications")
    .select("*, job_listings(*, employers(company_name))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Application[]>();

  // Fetch interviews for these applications
  const applicationIds = applications?.map((a) => a.id) || [];
  const { data: interviews } = applicationIds.length
    ? await supabase
        .from("interviews")
        .select("*")
        .in("application_id", applicationIds)
        .returns<Interview[]>()
    : { data: [] as Interview[] };

  const interviewMap: Record<string, Interview> = {};
  (interviews || []).forEach((i) => {
    interviewMap[i.application_id] = i;
  });

  return (
    <PageContainer>
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          My Applications
        </h1>

        <ApplicationsClient applications={applications || []} interviewMap={interviewMap} />

        {(!applications || applications.length === 0) && (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-secondary">
                <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75ZM8.75 2.5c-.69 0-1.25.56-1.25 1.25v.1c.832-.07 1.663-.1 2.5-.1s1.668.03 2.5.1v-.1c0-.69-.56-1.25-1.25-1.25h-2.5ZM10 10a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A.75.75 0 0 1 10 10Zm-3.5 5.85c0-.463.14-.917.401-1.3A41.472 41.472 0 0 0 10 15a41.46 41.46 0 0 0 3.099-.45c.261.383.401.837.401 1.3v.75a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75v-.75Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-text-secondary">No applications yet</p>
            <Link
              href="/jobs"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              Browse Jobs
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

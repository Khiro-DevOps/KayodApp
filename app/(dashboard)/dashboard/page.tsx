import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const isEmployer = profile?.role === "employer";

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Hello, {profile?.full_name || "there"} 👋
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {isEmployer
              ? "Manage your job postings and applicants"
              : "Find your next opportunity"}
          </p>
        </div>

        {isEmployer ? (
          <EmployerDashboard />
        ) : (
          <JobSeekerDashboard />
        )}
      </div>
    </PageContainer>
  );
}

function EmployerDashboard() {
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Jobs Posted" value="0" />
        <SummaryCard label="Applicants" value="0" />
        <SummaryCard label="Hires" value="0" />
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <h2 className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
          Quick Actions
        </h2>
        <a
          href="/jobs"
          className="flex items-center justify-between rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          Post a New Job
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function JobSeekerDashboard() {
  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Applications" value="0" />
        <SummaryCard label="Interviews" value="0" />
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <h2 className="font-(family-name:--font-heading) text-sm font-semibold text-text-primary">
          Quick Actions
        </h2>
        <a
          href="/jobs"
          className="flex items-center justify-between rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          Browse Jobs
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </a>
        <a
          href="/profile"
          className="flex items-center justify-between rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          Upload Resume
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 text-center">
      <p className="font-(family-name:--font-heading) text-2xl font-bold text-text-primary">
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
    </div>
  );
}

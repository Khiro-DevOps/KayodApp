import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { updateApplicationStatus, moveToApplied } from "./hr-applications-actions";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import HRApplicantCard from "./hr-applicant-card";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveDisplayName(candidate: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | null | undefined): string {
  const firstName = normalizeName(candidate?.first_name);
  const lastName = normalizeName(candidate?.last_name);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  const emailHandle = normalizeName((candidate?.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return emailHandle || "Unknown Applicant";
}

function deriveNamesFromUser(user: {
  email?: string | null;
  user_metadata?: unknown;
  raw_user_meta_data?: unknown;
}): { firstName: string; lastName: string } {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const firstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const lastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);
  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) {
    const [first, ...rest] = fullName.split(/\s+/);
    return {
      firstName: first ?? "",
      lastName: rest.join(" "),
    };
  }

  const handleFallback = normalizeName((user.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
  return {
    firstName: handleFallback || "User",
    lastName: "",
  };
}

export default async function HRApplicationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // Get all job postings with applicant count
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, is_published, employment_type")
    .order("created_at", { ascending: false });

  // Get all applications with full details
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, status, match_score, submitted_at, cover_letter, candidate_id,
      job_posting_id,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone ),
      resumes ( title, content_text ),
      job_postings ( title )
    `)
    .order("submitted_at", { ascending: false });

  // Repair candidate profile names from auth metadata for stale applicant rows.
  try {
    const admin = getAdminClient();
    const apps = (applications ?? []) as Array<{
      candidate_id: string;
      profiles?: {
        first_name?: string | null;
        last_name?: string | null;
      } | null;
    }>;

    const uniqueCandidateIds = Array.from(new Set(apps.map((app) => app.candidate_id).filter(Boolean)));

    for (const candidateId of uniqueCandidateIds) {
      const { data: authData } = await admin.auth.admin.getUserById(candidateId);
      const authUser = authData?.user;
      if (!authUser) continue;

      const { firstName, lastName } = deriveNamesFromUser(authUser);
      if (!firstName && !lastName) continue;

      let needsUpdate = false;
      for (const app of apps) {
        if (app.candidate_id !== candidateId) continue;
        const profile = app.profiles ?? {};
        const currentFirst = normalizeName(profile.first_name);
        const currentLast = normalizeName(profile.last_name);
        if (currentFirst !== firstName || currentLast !== lastName) {
          needsUpdate = true;
          app.profiles = { ...profile, first_name: firstName, last_name: lastName };
        }
      }

      if (needsUpdate) {
        await admin
          .from("profiles")
          .update({ first_name: firstName, last_name: lastName })
          .eq("id", candidateId);
      }
    }
  } catch {
    // Non-blocking: render list even when admin sync is unavailable.
  }

  // Group applications by job
  const appsByJob: Record<string, typeof applications> = {};
  (applications ?? []).forEach((app) => {
    const jid = app.job_posting_id;
    if (!appsByJob[jid]) appsByJob[jid] = [];
    appsByJob[jid]!.push(app);
  });

  const totalApps = applications?.length ?? 0;
  const newApps = applications?.filter((a) => a.status === "submitted").length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Applicants
          </h1>
          <div className="flex gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {totalApps} total
            </span>
            {newApps > 0 && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {newApps} new
              </span>
            )}
          </div>
        </div>

        {/* No applications */}
        {totalApps === 0 && (
          <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-2">
            <p className="text-sm text-text-secondary">No applications yet</p>
            <Link href="/jobs/manage/new" className="inline-block text-sm font-medium text-primary hover:underline">
              Post a job to get started
            </Link>
          </div>
        )}

        {/* Applications grouped by job */}
        {(jobs ?? []).map((job) => {
          const jobApps = appsByJob[job.id] ?? [];
          if (jobApps.length === 0) return null;

          return (
            <section key={job.id} className="space-y-3">
              {/* Job header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{job.title}</h2>
                  <p className="text-xs text-text-secondary capitalize">
                    {job.employment_type.replace("_", " ")} · {jobApps.length} applicant{jobApps.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.is_published ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {job.is_published ? "Published" : "Draft"}
                </span>
              </div>

              {/* Applicant cards */}
              {jobApps.map((app) => {
                const candidate = app.profiles as unknown as {
                  id: string; first_name: string; last_name: string;
                  email: string; phone: string | null;
                };
                const resume = app.resumes as unknown as { title: string } | null;
                const fullName = deriveDisplayName(candidate);

                return (
                  <HRApplicantCard
                    key={app.id}
                    app={app}
                    candidate={candidate}
                    resume={resume}
                    fullName={fullName}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}

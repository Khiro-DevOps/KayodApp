import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { updateApplicationStatus, moveToApplied } from "../hr-applications-actions";
import HRApplicantCard from "../hr-applicant-card";

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

export default async function HRApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // Note: We are using the Job Split View here as requested by the user for the detail route.
  
  // Get all job postings
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, is_published, employment_type")
    .order("created_at", { ascending: false });

  // Get all applications
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

  // Repair names
  try {
    const admin = getAdminClient();
    const apps = (applications ?? []) as any[];
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
        const p = app.profiles ?? {};
        if (normalizeName(p.first_name) !== firstName || normalizeName(p.last_name) !== lastName) {
          needsUpdate = true;
          app.profiles = { ...p, first_name: firstName, last_name: lastName };
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
    // Non-blocking
  }

  // Group applications by job
  const appsByJob: Record<string, any[]> = {};
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
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Applicants List
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

        {(jobs ?? []).map((job) => {
          const jobApps = appsByJob[job.id] ?? [];
          if (jobApps.length === 0) return null;

          return (
            <section key={job.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{job.title}</h2>
                  <p className="text-xs text-text-secondary capitalize">
                    {job.employment_type.replace("_", " ")} · {jobApps.length} applicant{jobApps.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {jobApps.map((app) => {
                const candidate = app.profiles;
                const resume = app.resumes;
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
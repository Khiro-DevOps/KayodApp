import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/types";
import { ApplicationsHubClient } from "./applications-client";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { computeAndStoreMatchScore } from "@/lib/compute-match-score";

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
    .from("profiles").select("role, tenant_id").eq("id", user.id).single<Pick<Profile, "role" | "tenant_id">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  const hrTenantId = profile?.tenant_id ?? null;

  // Fetch all active jobs (bypass strict tenant filter for local testing)
  const { data: jobs, error: jobsError } = await supabase
    .from("job_postings")
    .select("id, title, is_published, employment_type, tenant_id")
    .order("created_at", { ascending: false });
  const jobIds = jobs?.map((j) => j.id) || [];

  console.log("DIAG [1] Current HR User ID:", user.id);
  console.log("DIAG [2] Jobs Query Result:", { jobsCount: jobs?.length, jobsError, sampleJob: jobs?.[0] });

  // Fetch applications through the authenticated client so RLS enforces HR access.
  const { data: applications, error: appsError } = await supabase
    .from('job_applications')
    .select('*, candidate:profiles(*), job:job_postings(*)')
    .in('job_id', jobIds.length > 0 ? jobIds : ['00000000-0000-0000-0000-000000000000']);

  console.log("DIAG [3] Applications Query Result:", { appsCount: applications?.length, appsError, sampleApp: applications?.[0] });

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

  // Auto-compute missing match scores so Kanban cards show real values
  if (applications && applications.length > 0) {
    for (const app of applications) {
      if (app.match_score === null || app.match_score === undefined) {
        try {
          const result = await computeAndStoreMatchScore(app.id);
          if (result.success && typeof result.score === "number") {
            (app as { match_score: number | null }).match_score = result.score;
          }
        } catch {
          // Non-blocking fallback
        }
      }
    }
  }

  // Group applications by job
  const appsByJob: Record<string, typeof applications> = {};
  (applications ?? []).forEach((app) => {
    const jid = (app as any).job_id;
    if (!appsByJob[jid]) appsByJob[jid] = [];
    appsByJob[jid]!.push(app);
  });

  // Build active jobs list (published first)
  const activeJobs = (jobs ?? [])
    .filter((j: any) => j.is_published)
    .map((j: any) => ({ id: j.id, title: j.title }));

  const currentCompanyId = hrTenantId || (jobs && jobs[0]?.tenant_id) || "";

  return (
    <div className="min-h-[calc(100dvh-56px)] w-full">
      <ApplicationsHubClient
        applications={(applications ?? []) as any}
        currentCompanyId={currentCompanyId}
        activeJobs={activeJobs}
      />
    </div>
  );
}

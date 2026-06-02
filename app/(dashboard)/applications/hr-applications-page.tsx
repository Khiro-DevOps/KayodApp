import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/types";
import { ApplicationsHubClient } from "./applications-client";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { getAdminClient } from "@/lib/supabase/admin";

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
    .select("id, title, is_published, employment_type, tenant_id")
    .order("created_at", { ascending: false });

  // Get all applications with full details
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, status, match_score, submitted_at, cover_letter, candidate_id,
      job_posting_id,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone ),
      resumes ( title, content_text ),
      job_postings ( id, title, location, tenant_id )
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

  // Build active jobs list (published first)
  const activeJobs = (jobs ?? [])
    .filter((j: any) => j.is_published)
    .map((j: any) => ({ id: j.id, title: j.title }));

  const currentCompanyId = (jobs && jobs[0]?.tenant_id) || "";

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

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import { ApplicationsHubClient } from "./applications-client";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export default async function HRApplicantsHubPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "tenant_id">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // Get all job postings
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  // Get all applications for the Kanban board
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, 
      status, 
      match_score, 
      submitted_at, 
      job_posting_id,
      profiles!applications_candidate_id_fkey ( id, first_name, last_name, email, phone ),
      job_postings ( title )
    `)
    .order("submitted_at", { ascending: false });

  // Repair candidate profile names if needed
  try {
    const admin = getAdminClient();
    const apps = (applications ?? []) as any[];
    const uniqueCandidateIds = Array.from(new Set(apps.map((app) => app.profiles?.id).filter(Boolean)));

    for (const candidateId of uniqueCandidateIds) {
      const { data: authData } = await admin.auth.admin.getUserById(candidateId);
      const authUser = authData?.user;
      if (!authUser) continue;

      const { firstName, lastName } = deriveNamesFromUser(authUser);
      if (!firstName && !lastName) continue;

      let needsUpdate = false;
      for (const app of apps) {
        if (app.profiles?.id !== candidateId) continue;
        const p = app.profiles ?? {};
        if (normalizeName(p.first_name) !== firstName || normalizeName(p.last_name) !== lastName) {
          needsUpdate = true;
          app.profiles.first_name = firstName;
          app.profiles.last_name = lastName;
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

  return (
    <PageContainer>
      <ApplicationsHubClient
        applications={(applications ?? []) as any}
        activeJobs={(jobs ?? []) as any}
        currentCompanyId={profile?.tenant_id ?? ""}
      />
    </PageContainer>
  );
}
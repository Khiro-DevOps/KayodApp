import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { effectiveRole, isHRRole } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import { ApplicationsHubClient } from "./applications-client";
import type { ApplicationHubCard } from "./applications-kanban-board";
import { getHrJobScope } from "@/lib/hr-job-scope";

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

  const jobScope = await getHrJobScope(supabase, user.id);
  const tenantId = jobScope.tenantId;

  // ── Fetch job postings scoped to the HR user's tenant ────────────────────────
  // Allow both published and unpublished (HR should see their own drafts too).
  const jobQuery = supabase
    .from("job_postings")
    .select("id, title")
    .or(jobScope.filter)
    .order("created_at", { ascending: false });
  const { data: jobs, error: jobsError } = await jobQuery;
  const activeJobs = (jobs ?? []) as { id: string; title: string }[];
  const tenantJobIds = activeJobs.map((j) => j.id);

  if (jobsError) {
    console.error("Applicants jobs fetch error:", jobsError);
  }
  if (process.env.DEBUG_APPLICANTS === "1") {
    console.log("[applicants-debug] tenant id used", tenantId);
    console.log("[applicants-debug] number of jobs returned", activeJobs.length);
  }

  // ── Fetch job_applications for the tenant's jobs ─────────────────────────────
  // Uses an inner join via the nested select: only rows whose job_id references
  // a job_posting owned by this tenant will be returned.
  let applications: ApplicationHubCard[] = [];

  if (tenantJobIds.length > 0) {
    const { data: rawApps, error: applicationsError } = await supabase
      .from("job_applications")
      .select(`
        id,
        job_id,
        applicant_id,
        resume_id,
        status,
        cover_letter,
        match_score,
        hr_notes,
        rejection_reason,
        created_at,
        updated_at,
        candidate:profiles ( id, first_name, last_name, email, phone, avatar_url, city, country ),
        job:job_postings ( id, title, location, tenant_id )
      `)
      .in("job_id", tenantJobIds)
      .order("created_at", { ascending: false });

    if (applicationsError) {
      console.error("Applicants applications fetch error:", applicationsError);
    }

    if (process.env.DEBUG_APPLICANTS === "1") {
      console.log("[applicants-debug] number of job_applications returned before mapping", rawApps?.length ?? 0);
      console.log("[applicants-debug] application status values", (rawApps ?? []).map((app) => app.status));
    }

    // Map to ApplicationHubCard — use created_at as submitted_at
    const mapped = (rawApps ?? []).map((app: any): ApplicationHubCard => ({
      id: app.id,
      job_id: app.job_id,
      applicant_id: app.applicant_id,
      resume_id: app.resume_id ?? "",
      status: app.status ?? "applied",
      cover_letter: app.cover_letter ?? null,
      match_score: app.match_score ?? null,
      hr_notes: app.hr_notes ?? null,
      submitted_at: app.created_at ?? new Date().toISOString(),
      updated_at: app.updated_at ?? new Date().toISOString(),
      candidate: app.candidate ?? null,
      job: app.job ?? null,
    }));

    applications = mapped;

    if (process.env.DEBUG_APPLICANTS === "1") {
      console.log("[applicants-debug] number after stage mapping", applications.length);
      console.log("[applicants-debug] rows dropped by mapping", []);
    }

    // ── Repair candidate profile names if missing (best-effort) ──────────────
    try {
      const admin = getAdminClient();
      const uniqueApplicantIds = Array.from(
        new Set(applications.map((a) => {
          const c = Array.isArray(a.candidate) ? a.candidate[0] : a.candidate;
          return c?.id ?? null;
        }).filter(Boolean))
      ) as string[];

      for (const applicantId of uniqueApplicantIds) {
        const { data: authData } = await admin.auth.admin.getUserById(applicantId);
        const authUser = authData?.user;
        if (!authUser) continue;

        const { firstName, lastName } = deriveNamesFromUser(authUser);
        if (!firstName && !lastName) continue;

        let needsUpdate = false;
        for (const app of applications) {
          const p = Array.isArray(app.candidate) ? app.candidate[0] : app.candidate;
          if (!p || p.id !== applicantId) continue;
          if (normalizeName(p.first_name) !== firstName || normalizeName(p.last_name) !== lastName) {
            needsUpdate = true;
            p.first_name = firstName;
            p.last_name = lastName;
          }
        }

        if (needsUpdate) {
          await admin
            .from("profiles")
            .update({ first_name: firstName, last_name: lastName })
            .eq("id", applicantId);
        }
      }
    } catch {
      // Non-blocking
    }
  } else if (process.env.DEBUG_APPLICANTS === "1") {
    console.log("[applicants-debug] number of job_applications returned before mapping", 0);
    console.log("[applicants-debug] number after stage mapping", 0);
    console.log("[applicants-debug] rows dropped by mapping", []);
  }

  return (
    <PageContainer>
      <ApplicationsHubClient
        applications={applications}
        activeJobs={activeJobs}
        currentCompanyId={tenantId ?? ""}
      />
    </PageContainer>
  );
}
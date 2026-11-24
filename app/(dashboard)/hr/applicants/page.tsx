import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import PageContainer from "@/components/ui/page-container";
import { requireHrPermission } from "@/lib/rbac/server";
import { ApplicationsHubClient } from "./applications-client";
import type { ApplicationHubCard } from "./applications-kanban-board";
import { getHrJobScope, getTenantTeamNamesMap, resolveOwnerName } from "@/lib/hr-job-scope";
import { computeAndStoreApplicationMatch } from "@/lib/match-scoring";

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

export default async function HRApplicantsHubPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string; job?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialScope: "mine" | "all" =
    resolvedParams?.scope === "all" ? "all" : "mine";
  const initialJobParam =
    typeof resolvedParams?.job === "string" ? resolvedParams.job.trim() : "";

  const ctx = await requireHrPermission("ats:view");
  const supabase = await createClient();
  const user = { id: ctx.id };

  const admin = getAdminClient();
  const jobScope = await getHrJobScope(admin, user.id);
  const tenantId = jobScope.tenantId;
  const teamNamesMap = await getTenantTeamNamesMap(supabase, tenantId);

  // ── Fetch job postings scoped to the HR user's tenant ────────────────────────
  // Allow both published and unpublished (HR should see their own drafts too).
  const jobQuery = admin
    .from("job_postings")
    .select("id, title, created_by, created_at")
    .or(jobScope.filter)
    .order("created_at", { ascending: false });
  const { data: jobs, error: jobsError } = await jobQuery;
  const rawJobs = (jobs ?? []) as Array<{
    id: string;
    title: string;
    created_by?: string | null;
    created_at?: string | null;
  }>;
  const activeJobs = rawJobs.map((j) => ({
    id: j.id,
    title: j.title,
    created_by: j.created_by ?? null,
    ownerFirstName: resolveOwnerName(teamNamesMap, j.created_by, "first"),
    ownerFullName: resolveOwnerName(teamNamesMap, j.created_by, "full"),
  }));
  const tenantJobIds = activeJobs.map((j) => j.id);

  if (jobsError) {
    console.error("Applicants jobs fetch error:", jobsError);
  }
  if (process.env.DEBUG_APPLICANTS === "1") {
    console.log("[applicants-debug] tenant id used", tenantId);
    console.log("[applicants-debug] number of jobs returned", activeJobs.length);
  }

  // ── Fetch job_applications for the tenant's jobs ─────────────────────────────
  // Uses admin client scoped to tenantJobIds so RLS on job_applications / profiles
  // never hides newly submitted candidate applications.
  let applications: ApplicationHubCard[] = [];

  if (tenantJobIds.length > 0) {
    const { data: rawApps, error: applicationsError } = await admin
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
    const mapped = (rawApps ?? []).map((app: Record<string, unknown>): ApplicationHubCard => ({
      id: String(app.id ?? ""),
      job_id: String(app.job_id ?? ""),
      applicant_id: typeof app.applicant_id === "string" ? app.applicant_id : undefined,
      resume_id: typeof app.resume_id === "string" ? app.resume_id : "",
      status: typeof app.status === "string" ? app.status : "applied",
      cover_letter: typeof app.cover_letter === "string" ? app.cover_letter : null,
      match_score: typeof app.match_score === "number" ? app.match_score : null,
      hr_notes: typeof app.hr_notes === "string" ? app.hr_notes : null,
      rejection_reason: typeof app.rejection_reason === "string" ? app.rejection_reason : null,
      submitted_at: typeof app.created_at === "string" ? app.created_at : new Date().toISOString(),
      updated_at: typeof app.updated_at === "string" ? app.updated_at : new Date().toISOString(),
      candidate: (app.candidate as ApplicationHubCard["candidate"]) ?? null,
      job: (app.job as ApplicationHubCard["job"]) ?? null,
    }));

    applications = mapped;

    const appIds = applications.map((a) => a.id).filter(Boolean);
    if (appIds.length > 0) {
      const { data: offerRows } = await admin
        .from("job_offers")
        .select("application_id, status, is_active, updated_at")
        .in("application_id", appIds)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false });

      const offerStatusByAppId = new Map<string, string>();
      for (const row of offerRows ?? []) {
        const r = row as { application_id?: string | null; status?: string | null };
        if (r.application_id && r.status && !offerStatusByAppId.has(r.application_id)) {
          offerStatusByAppId.set(r.application_id, r.status);
        }
      }
      for (const app of applications) {
        app.offer_status = offerStatusByAppId.get(app.id) ?? null;
      }
    }

    // Auto-compute any unscored applications using canonical scoring engine
    const unscoredApps = applications.filter((a) => a.match_score === null || Number(a.match_score) === 0);
    if (unscoredApps.length > 0) {
      await Promise.all(
        unscoredApps.map(async (app) => {
          try {
            const res = await computeAndStoreApplicationMatch(app.id, true);
            if (res.success && typeof res.score === "number") {
              app.match_score = res.score;
            }
          } catch {
            // Non-blocking
          }
        })
      );
    }

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
        currentUserId={user.id}
        initialScope={initialScope}
        initialJobId={initialJobParam}
      />
    </PageContainer>
  );
}
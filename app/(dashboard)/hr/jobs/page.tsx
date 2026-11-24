import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import type { JobListing, JobPosting, Profile } from "@/lib/types";
import { requireHrPermission } from "@/lib/rbac/server";
import { canHr } from "@/lib/rbac/permissions";
import { fetchOnlineHiredCountsByJob } from "@/lib/job-headcount-server";
import ManageJobsWorkspace from "./manage-jobs-workspace";
import { getHrJobScope, getTenantTeamNamesMap, resolveOwnerName } from "@/lib/hr-job-scope";

type WorkspaceProfile = Pick<Profile, "role" | "tenant_id"> & {
  tenants?: { name?: string | null } | null;
};

type JobPostingWithApplicantCount = JobPosting & {
  applicantCount: number;
  work_location_id?: string | null;
  work_mode?: string | null;
};

type LegacyJobListingWithApplicantCount = JobListing & {
  applicantCount: number;
};

type WorkspaceJob = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  employment_type: JobPosting["employment_type"];
  work_setup: string | null;
  work_location_id: string | null;
  branch_name: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  slots: number;
  hired_walkin_count: number;
  onlineHiredCount: number;
  isLegacy?: boolean;
  is_published: boolean;
  created_at: string;
  closes_at: string | null;
  departments?: { name?: string | null } | null;
  required_skills?: string[] | null;
  applicantCount: number;
  created_by: string | null;
  ownerName: string;
};

const JOBS_CURSOR_PAGE_SIZE = 20;

export default async function ManageJobsPage({
  searchParams,
}: {
  searchParams?: Promise<{ cursor?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const cursorParam = typeof resolvedParams?.cursor === "string" ? resolvedParams.cursor.trim() : null;
  const supabase = await createClient();

  const ctx = await requireHrPermission("jobs:view");
  const user = { id: ctx.id };

  const admin = getAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, tenant_id, tenants(name)")
    .eq("id", user.id)
    .maybeSingle<WorkspaceProfile>();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
  }

  const jobScope = await getHrJobScope(supabase, user.id);
  const tenantId = jobScope.tenantId ?? "";
  let companyName =
    profile?.tenants?.name?.trim() ||
    "";
  if (!companyName && tenantId) {
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle<{ name?: string | null }>();
    companyName = tenantRow?.name?.trim() || "";
  }
  if (!companyName) {
    companyName = "Company";
  }

  const teamNamesMap = await getTenantTeamNamesMap(supabase, tenantId || null);

  let currentJobsQuery = supabase
    .from("job_postings")
    .select("*, departments(name)");

  if (tenantId) {
    currentJobsQuery = currentJobsQuery.eq("tenant_id", tenantId);
  } else {
    currentJobsQuery = currentJobsQuery.eq("created_by", user.id);
  }

  if (cursorParam) {
    currentJobsQuery = currentJobsQuery.lt("created_at", cursorParam);
  }

  let legacyJobsQuery = supabase.from("job_listings").select("*, employers(company_name)");
  if (tenantId) {
    legacyJobsQuery = legacyJobsQuery.eq("tenant_id", tenantId);
  } else {
    legacyJobsQuery = legacyJobsQuery.eq("tenant_id", user.id);
  }

  const results = await Promise.all([
    currentJobsQuery.order("created_at", { ascending: false }).limit(JOBS_CURSOR_PAGE_SIZE + 1),
    legacyJobsQuery.order("created_at", { ascending: false }).limit(JOBS_CURSOR_PAGE_SIZE),
  ]);

  const rawCurrentJobs = (results[0].data as JobPostingWithApplicantCount[] | null | undefined) ?? [];
  const hasNextCursorPage = rawCurrentJobs.length > JOBS_CURSOR_PAGE_SIZE;
  const currentJobs = hasNextCursorPage
    ? rawCurrentJobs.slice(0, JOBS_CURSOR_PAGE_SIZE)
    : rawCurrentJobs;
  const nextCursor = hasNextCursorPage
    ? currentJobs[currentJobs.length - 1]?.created_at ?? null
    : null;
  const currentJobsError = results[0].error;
  let legacyJobs = results[1].data as JobListing[] | null | undefined;
  let legacyJobsError = results[1].error;

  if (currentJobsError) {
    console.error("Current jobs fetch error:", currentJobsError);
  }

  if (legacyJobsError) {
    const e = legacyJobsError as {
      code?: string | null;
      message?: string | null;
      details?: string | null;
      hint?: string | null;
      status?: number | null;
    };
    // If the legacy table doesn't exist in Supabase, treat as empty legacy set and continue.
    if (e?.code === "PGRST205" || (e?.message && String(e.message).includes("Could not find the table"))) {
      console.info("Legacy jobs table not found (PGRST205). Continuing without legacy jobs.");
      legacyJobs = [];
      legacyJobsError = null;
    } else {
      console.error("Legacy jobs fetch error:", {
        message: e?.message ?? null,
        details: e?.details ?? null,
        hint: e?.hint ?? null,
        code: e?.code ?? null,
        status: e?.status ?? null,
        raw: e,
      });
    }
  }

  const jobIds = currentJobs?.map((job) => job.id) ?? [];
  const legacyJobIds = legacyJobs?.map((job) => job.id) ?? [];
  const branchIds = Array.from(
    new Set(
      (currentJobs ?? [])
        .map((job) => job.work_location_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const branchMap: Record<string, string> = {};
  if (branchIds.length) {
    const { data: branches } = await supabase
      .from("office_branches")
      .select("id, name")
      .in("id", branchIds);
    branches?.forEach((branch) => {
      if (branch.id && branch.name) {
        branchMap[branch.id] = branch.name;
      }
    });
  }

  const countMap: Record<string, number> = {};
  const legacyCountMap: Record<string, number> = {};
  let onlineHiredMap: Record<string, number> = {};

  if (jobIds.length) {
    const [{ data: counts, error: countErr }, { data: jaCounts, error: jaCountErr }, fetchedOnlineHired] = await Promise.all([
      supabase
        .from("applications")
        .select("job_posting_id, status")
        .in("job_posting_id", jobIds as string[])
        .not("status", "in", '("rejected","withdrawn")'),
      supabase
        .from("job_applications")
        .select("job_id, status")
        .in("job_id", jobIds as string[])
        .not("status", "in", '("rejected","withdrawn")'),
      fetchOnlineHiredCountsByJob(jobIds),
    ]);
    onlineHiredMap = fetchedOnlineHired;

    if (countErr) {
      console.error("Applicant count fetch error (applications):", countErr);
    } else {
      counts?.forEach((app) => {
        if (!app.job_posting_id) return;
        countMap[app.job_posting_id] = (countMap[app.job_posting_id] ?? 0) + 1;
      });
    }

    if (jaCountErr) {
      console.info("job_applications count fetch notice:", jaCountErr.message);
    } else {
      jaCounts?.forEach((app) => {
        if (!app.job_id) return;
        // Count from job_applications if not already counted via applications table
        if (!countMap[app.job_id]) {
          countMap[app.job_id] = (countMap[app.job_id] ?? 0) + 1;
        }
      });
    }
  }

  if (legacyJobIds.length) {
    const { data: counts, error: countErr } = await supabase
      .from("applications")
      .select("job_listing_id")
      .in("job_listing_id", legacyJobIds as string[]);

    if (countErr) {
      console.error("Legacy applicant count fetch error:", countErr);
    } else {
      counts?.forEach((app) => {
        if (!app.job_listing_id) return;
        legacyCountMap[app.job_listing_id] = (legacyCountMap[app.job_listing_id] ?? 0) + 1;
      });
    }
  }

  const jobsWithCounts: WorkspaceJob[] = [
    ...((currentJobs ?? []) as JobPostingWithApplicantCount[]).map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      employment_type: job.employment_type,
      work_setup: (job.work_setup ?? (job as { work_mode?: string | null }).work_mode ?? null) as string | null,
      work_location_id: job.work_location_id ?? null,
      branch_name: job.work_location_id ? (branchMap[job.work_location_id] ?? null) : null,
      location: job.location,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      currency: job.currency,
      slots: job.slots ?? 1,
      hired_walkin_count: job.hired_walkin_count ?? 0,
      onlineHiredCount: onlineHiredMap[job.id] ?? 0,
      isLegacy: false,
      is_published: job.is_published,
      created_at: job.created_at,
      closes_at: job.closes_at,
      departments: job.departments,
      required_skills: job.required_skills ?? null,
      applicantCount: countMap[job.id] ?? 0,
      created_by: job.created_by ?? null,
      ownerName: resolveOwnerName(teamNamesMap, job.created_by, "full"),
    })),
    ...((legacyJobs ?? []) as LegacyJobListingWithApplicantCount[]).map((job) => {
      const legacyCreatedAt = (job as unknown as { created_at?: string }).created_at ?? new Date(0).toISOString();

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        employment_type: job.employment_type,
        work_setup: job.work_setup ?? null,
        work_location_id: null,
        branch_name: null,
        location: job.location,
        salary_min: null,
        salary_max: null,
        currency: "PHP",
        slots: 1,
        hired_walkin_count: 0,
        onlineHiredCount: 0,
        isLegacy: true,
        is_published: String(job.status).toLowerCase() === "active",
        created_at: legacyCreatedAt,
        closes_at: null,
        departments: job.employers ? { name: job.employers.company_name } : null,
        required_skills: job.skills ?? null,
        applicantCount: legacyCountMap[job.id] ?? 0,
        created_by: null,
        ownerName: "HR Team",
      };
    }),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const canManageWalkIn =
    canHr(ctx.hr_role, "jobs:manage", ctx.is_tenant_owner) ||
    canHr(ctx.hr_role, "hires:confirm", ctx.is_tenant_owner);

  return (
    <ManageJobsWorkspace
      jobs={jobsWithCounts}
      companyName={companyName}
      nextCursor={nextCursor}
      currentCursor={cursorParam}
      canManageWalkIn={canManageWalkIn}
    />
  );
}
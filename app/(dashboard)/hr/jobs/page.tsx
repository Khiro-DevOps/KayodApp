import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { JobListing, JobPosting, Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";
import ManageJobsWorkspace from "./manage-jobs-workspace";

type WorkspaceProfile = Pick<Profile, "role" | "tenant_id"> & {
  tenants?: { name?: string | null } | null;
};

type JobPostingWithApplicantCount = JobPosting & {
  applicantCount: number;
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
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  slots: number;
  is_published: boolean;
  created_at: string;
  closes_at: string | null;
  departments?: { name?: string | null } | null;
  applicantCount: number;
};

export default async function ManageJobsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole =
    (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, tenant_id, tenants(name)")
    .eq("id", user.id)
    .maybeSingle<WorkspaceProfile>();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
  }

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);
  if (!isHR) {
    redirect("/dashboard");
  }

  const tenantId = profile?.tenant_id?.trim() ?? "";
  const companyName = profile?.tenants?.name?.trim() || "Your Company";

  const currentJobsQuery = supabase.from("job_postings").select("*, departments(name)").eq("created_by", user.id);

  let legacyJobsQuery = supabase.from("job_listings").select("*, employers(company_name)");
  if (tenantId) {
    legacyJobsQuery = legacyJobsQuery.eq("tenant_id", tenantId);
  } else {
    legacyJobsQuery = legacyJobsQuery.eq("tenant_id", user.id);
  }

  const results = await Promise.all([
    currentJobsQuery.order("created_at", { ascending: false }),
    legacyJobsQuery.order("created_at", { ascending: false }),
  ]);

  let currentJobs = results[0].data as JobPosting[] | null | undefined;
  let currentJobsError = results[0].error;
  let legacyJobs = results[1].data as JobListing[] | null | undefined;
  let legacyJobsError = results[1].error;

  if (currentJobsError) {
    console.error("Current jobs fetch error:", currentJobsError);
  }

  if (legacyJobsError) {
    const e = legacyJobsError as any;
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

  const countMap: Record<string, number> = {};
  const legacyCountMap: Record<string, number> = {};

  if (jobIds.length) {
    const { data: counts, error: countErr } = await supabase
      .from("applications")
      .select("job_posting_id")
      .in("job_posting_id", jobIds as string[]);

    if (countErr) {
      console.error("Applicant count fetch error:", countErr);
    } else {
      counts?.forEach((app) => {
        if (!app.job_posting_id) return;
        countMap[app.job_posting_id] = (countMap[app.job_posting_id] ?? 0) + 1;
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
      location: job.location,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      currency: job.currency,
      slots: job.slots,
      is_published: job.is_published,
      created_at: job.created_at,
      closes_at: job.closes_at,
      departments: job.departments,
      applicantCount: countMap[job.id] ?? 0,
    })),
    ...((legacyJobs ?? []) as LegacyJobListingWithApplicantCount[]).map((job) => {
      const legacyCreatedAt = (job as unknown as { created_at?: string }).created_at ?? new Date(0).toISOString();

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        employment_type: job.employment_type,
        location: job.location,
        salary_min: null,
        salary_max: null,
        currency: "PHP",
        slots: 1,
        is_published: String(job.status).toLowerCase() === "active",
        created_at: legacyCreatedAt,
        closes_at: null,
        departments: job.employers ? { name: job.employers.company_name } : null,
        applicantCount: legacyCountMap[job.id] ?? 0,
      };
    }),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return <ManageJobsWorkspace jobs={jobsWithCounts} companyName={companyName} />;
}
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeWorkSetup, type ContractWorkSetup } from "@/lib/work-arrangement";

export interface JobPostingPositionInfo {
  title: string | null;
  offerTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  workMode: ContractWorkSetup | null;
  workSetup: ContractWorkSetup | null;
  offerWorkSetup: ContractWorkSetup | null;
  jobWorkSetup: ContractWorkSetup | null;
  workLocationId: string | null;
}

interface RawApplicationJobRow {
  id: string;
  applicant_id: string | null;
  status: string | null;
  job:
    | {
        title: string | null;
        department_id: string | null;
        work_setup?: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        title: string | null;
        department_id: string | null;
        work_setup?: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
}

interface RawOfferRow {
  application_id: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  job_metadata?: Record<string, unknown> | null;
}

function normalizeOptionalSetup(raw: string | null | undefined): ContractWorkSetup | null {
  const val = String(raw ?? "").trim();
  if (!val) return null;
  return normalizeWorkSetup(val);
}

/**
 * Batch-fetches the linked job posting title, department, work setup, and office branch
 * for a set of profile IDs, prioritizing hired applications and linked job_offers.
 * Matches across job_applications.applicant_id, legacy applications.candidate_id, and email.
 */
export async function getJobPostingPositionsByProfileIds(
  profileIds: string[],
): Promise<Record<string, JobPostingPositionInfo>> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const admin = getAdminClient();

  // Resolve any alternate profile IDs sharing the same email (e.g. dev vs candidate profile)
  const targetIdByQueryId = new Map<string, string>();
  for (const id of uniqueIds) {
    targetIdByQueryId.set(id, id);
  }

  const { data: sourceProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", uniqueIds);

  const emails = Array.from(
    new Set(
      (sourceProfiles ?? [])
        .map((p) => p.email?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  );

  if (emails.length > 0) {
    const emailToTargetId = new Map<string, string>();
    for (const p of sourceProfiles ?? []) {
      if (p.email) {
        emailToTargetId.set(p.email.trim().toLowerCase(), p.id);
      }
    }

    const { data: allMatchingProfiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("email", emails);

    for (const p of allMatchingProfiles ?? []) {
      const targetId = p.email ? emailToTargetId.get(p.email.trim().toLowerCase()) : undefined;
      if (targetId && !targetIdByQueryId.has(p.id)) {
        targetIdByQueryId.set(p.id, targetId);
      }
    }
  }

  const queryProfileIds = Array.from(targetIdByQueryId.keys());

  const { data, error: jobAppError } = await admin
    .from("job_applications")
    .select(
      "id, applicant_id, status, updated_at, created_at, job:job_postings(title, department_id, work_setup, departments(name))",
    )
    .in("applicant_id", queryProfileIds)
    .order("updated_at", { ascending: false });

  if (jobAppError) {
    console.error("getJobPostingPositionsByProfileIds: job_applications query failed:", jobAppError.message);
  }

  let rows: RawApplicationJobRow[] = ((data ?? []) as unknown as RawApplicationJobRow[]).map((r) => ({
    ...r,
    applicant_id: (r.applicant_id && targetIdByQueryId.get(r.applicant_id)) || r.applicant_id,
  }));

  // Also check legacy applications table for any profileIds without a job_applications hit
  const matchedTargetIds = new Set(rows.map((r) => r.applicant_id).filter(Boolean) as string[]);
  const missingQueryIds = queryProfileIds.filter((id) => {
    const targetId = targetIdByQueryId.get(id) ?? id;
    return !matchedTargetIds.has(targetId);
  });

  if (missingQueryIds.length > 0) {
    const { data: legacyApps } = await admin
      .from("applications")
      .select(
        "id, candidate_id, status, updated_at, created_at, job:job_postings(title, department_id, work_setup, departments(name))",
      )
      .in("candidate_id", missingQueryIds)
      .order("updated_at", { ascending: false });

    const mappedLegacy = ((legacyApps ?? []) as unknown as Array<{
      id: string;
      candidate_id: string | null;
      status: string | null;
      job: RawApplicationJobRow["job"];
    }>).map((r) => ({
      id: r.id,
      applicant_id: (r.candidate_id && targetIdByQueryId.get(r.candidate_id)) || r.candidate_id,
      status: r.status,
      job: r.job,
    }));
    rows = [...rows, ...mappedLegacy];
  }

  const appIds = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));

  const offerByAppId = new Map<string, RawOfferRow>();
  if (appIds.length > 0) {
    const { data: offers, error: offersError } = await admin
      .from("job_offers")
      .select("application_id, work_setup, work_mode, work_location_id, job_metadata")
      .in("application_id", appIds)
      .order("updated_at", { ascending: false });

    let resolvedOffers = offers as RawOfferRow[] | null;
    if (offersError) {
      // Fallback if work_setup column is absent on older schema
      const { data: fallbackOffers } = await admin
        .from("job_offers")
        .select("application_id, work_mode, work_location_id, job_metadata")
        .in("application_id", appIds)
        .order("updated_at", { ascending: false });
      resolvedOffers = fallbackOffers as RawOfferRow[] | null;
    }

    for (const offer of resolvedOffers ?? []) {
      if (offer.application_id && !offerByAppId.has(offer.application_id)) {
        offerByAppId.set(offer.application_id, offer);
      }
    }
  }

  const result: Record<string, JobPostingPositionInfo> = {};
  const hasHired: Record<string, boolean> = {};

  for (const row of rows) {
    const profileId = row.applicant_id;
    if (!profileId) continue;

    const jobObj = Array.isArray(row.job) ? row.job[0] : row.job;
    const offer = offerByAppId.get(row.id);
    const metaTitle =
      offer?.job_metadata && typeof offer.job_metadata.job_title === "string"
        ? offer.job_metadata.job_title.trim()
        : null;
    const title = jobObj?.title?.trim() || metaTitle || null;
    if (!title && !metaTitle) continue;

    const deptObj = Array.isArray(jobObj?.departments)
      ? jobObj?.departments[0]
      : jobObj?.departments;
    const departmentName = deptObj?.name?.trim() || null;
    const departmentId = jobObj?.department_id ?? null;

    const offerWorkSetup = normalizeOptionalSetup(offer?.work_setup ?? offer?.work_mode);
    const jobWorkSetup = normalizeOptionalSetup(jobObj?.work_setup);
    const workSetup = offerWorkSetup ?? jobWorkSetup ?? null;
    const workLocationId = offer?.work_location_id ?? null;
    const isHired = String(row.status ?? "").toLowerCase() === "hired";

    if (!result[profileId] || (isHired && !hasHired[profileId])) {
      result[profileId] = {
        title,
        offerTitle: metaTitle,
        departmentId,
        departmentName,
        workMode: workSetup,
        workSetup,
        offerWorkSetup,
        jobWorkSetup,
        workLocationId,
      };
      if (isHired) {
        hasHired[profileId] = true;
      }
    }
  }

  return result;
}

export async function getJobPostingPositionForProfile(
  profileId: string,
): Promise<JobPostingPositionInfo | null> {
  if (!profileId) return null;
  const map = await getJobPostingPositionsByProfileIds([profileId]);
  return map[profileId] ?? null;
}

import { getAdminClient } from "@/lib/supabase/admin";

export interface JobPostingPositionInfo {
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  workMode: "onsite" | "hybrid" | "remote" | null;
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
        work_location_id?: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        title: string | null;
        department_id: string | null;
        work_setup?: string | null;
        work_location_id?: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
}

interface RawOfferRow {
  application_id: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
}

function normalizeJobWorkMode(
  raw: string | null | undefined,
): "onsite" | "hybrid" | "remote" | null {
  const val = String(raw ?? "").trim().toLowerCase();
  if (!val) return null;
  if (val === "hybrid") return "hybrid";
  if (val === "remote" || val === "wfh") return "remote";
  if (val === "onsite" || val === "on-site" || val === "in_person") return "onsite";
  return null;
}

/**
 * Batch-fetches the linked job posting title, department, work setup, and office branch
 * for a set of profile IDs, prioritizing hired applications and linked job_offers.
 */
export async function getJobPostingPositionsByProfileIds(
  profileIds: string[],
): Promise<Record<string, JobPostingPositionInfo>> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const admin = getAdminClient();
  const { data } = await admin
    .from("job_applications")
    .select(
      "id, applicant_id, status, updated_at, created_at, job:job_postings(title, department_id, work_setup, work_location_id, departments(name))",
    )
    .in("applicant_id", uniqueIds)
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as unknown as RawApplicationJobRow[];
  const appIds = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));

  const offerByAppId = new Map<string, RawOfferRow>();
  if (appIds.length > 0) {
    const { data: offers } = await admin
      .from("job_offers")
      .select("application_id, work_setup, work_mode, work_location_id")
      .in("application_id", appIds)
      .order("updated_at", { ascending: false });

    for (const offer of (offers ?? []) as RawOfferRow[]) {
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
    const title = jobObj?.title?.trim() || null;
    if (!title) continue;

    const offer = offerByAppId.get(row.id);
    const deptObj = Array.isArray(jobObj?.departments)
      ? jobObj?.departments[0]
      : jobObj?.departments;
    const departmentName = deptObj?.name?.trim() || null;
    const departmentId = jobObj?.department_id ?? null;
    const workMode = normalizeJobWorkMode(
      offer?.work_mode ?? offer?.work_setup ?? jobObj?.work_setup,
    );
    const workLocationId =
      offer?.work_location_id ?? jobObj?.work_location_id ?? null;
    const isHired = String(row.status ?? "").toLowerCase() === "hired";

    if (!result[profileId] || (isHired && !hasHired[profileId])) {
      result[profileId] = {
        title,
        departmentId,
        departmentName,
        workMode,
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

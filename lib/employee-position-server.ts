import { getAdminClient } from "@/lib/supabase/admin";

export interface JobPostingPositionInfo {
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

interface RawApplicationJobRow {
  applicant_id: string | null;
  status: string | null;
  job:
    | {
        title: string | null;
        department_id: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        title: string | null;
        department_id: string | null;
        departments: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
}

/**
 * Batch-fetches the linked job posting title and department for a set of profile IDs,
 * prioritizing hired applications before falling back to the latest application.
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
      "applicant_id, status, updated_at, created_at, job:job_postings(title, department_id, departments(name))",
    )
    .in("applicant_id", uniqueIds)
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as unknown as RawApplicationJobRow[];
  const result: Record<string, JobPostingPositionInfo> = {};
  const hasHired: Record<string, boolean> = {};

  for (const row of rows) {
    const profileId = row.applicant_id;
    if (!profileId) continue;

    const jobObj = Array.isArray(row.job) ? row.job[0] : row.job;
    const title = jobObj?.title?.trim() || null;
    if (!title) continue;

    const deptObj = Array.isArray(jobObj?.departments)
      ? jobObj?.departments[0]
      : jobObj?.departments;
    const departmentName = deptObj?.name?.trim() || null;
    const departmentId = jobObj?.department_id ?? null;
    const isHired = String(row.status ?? "").toLowerCase() === "hired";

    if (!result[profileId] || (isHired && !hasHired[profileId])) {
      result[profileId] = {
        title,
        departmentId,
        departmentName,
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

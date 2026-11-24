import { getAdminClient } from "@/lib/supabase/admin";
import {
  normalizeJobLevel,
  type SupervisorCandidate,
} from "@/lib/workforce-hierarchy";
import { computeJobHeadcount, type JobHeadcountSummary } from "./job-headcount";

export interface DepartmentOption {
  id: string;
  name: string;
}

export async function fetchDepartmentsAndSupervisors(
  tenantId: string | null,
): Promise<{
  departments: DepartmentOption[];
  supervisorCandidates: SupervisorCandidate[];
}> {
  const admin = getAdminClient();

  let employeesQuery = admin
    .from("employees")
    .select(
      `id, tenant_id, department_id, job_title, job_level, employment_status, profile:profiles!profile_id(first_name, last_name), departments(id, name)`,
    )
    .eq("employment_status", "active");

  if (tenantId) {
    employeesQuery = employeesQuery.eq("tenant_id", tenantId);
  }

  const [{ data: deptRows }, { data: empRows }] = await Promise.all([
    admin.from("departments").select("id, name").order("name", { ascending: true }),
    employeesQuery,
  ]);

  const departments: DepartmentOption[] = (deptRows ?? [])
    .filter((d): d is { id: string; name: string } => Boolean(d?.id && d?.name))
    .map((d) => ({ id: d.id, name: d.name }));

  const supervisorCandidates: SupervisorCandidate[] = (empRows ?? []).map((row) => {
    const r = row as {
      id: string;
      tenant_id?: string | null;
      department_id?: string | null;
      job_title?: string | null;
      job_level?: string | null;
      employment_status?: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
      departments?:
        | { id?: string; name?: string | null }
        | Array<{ id?: string; name?: string | null }>
        | null;
    };
    const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
    const fullName =
      [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
      "Employee";

    return {
      id: r.id,
      tenant_id: r.tenant_id ?? null,
      department_id: r.department_id ?? null,
      department_name: dept?.name ?? null,
      job_title: r.job_title ?? "Employee",
      job_level: normalizeJobLevel(r.job_level),
      employment_status: r.employment_status ?? "active",
      full_name: fullName,
    };
  });

  return { departments, supervisorCandidates };
}

/**
 * Counts online hired applications (`status === 'hired'`) per job_posting_id,
 * deduplicating across `applications` and `job_applications` by application id.
 */
export async function fetchOnlineHiredCountsByJob(
  jobIds: string[],
): Promise<Record<string, number>> {
  if (jobIds.length === 0) return {};
  const admin = getAdminClient();

  const [{ data: legacyApps }, { data: jobApps }] = await Promise.all([
    admin
      .from("applications")
      .select("id, job_posting_id, status")
      .in("job_posting_id", jobIds)
      .eq("status", "hired"),
    admin
      .from("job_applications")
      .select("id, job_id, status")
      .in("job_id", jobIds)
      .eq("status", "hired"),
  ]);

  const seenByJob = new Map<string, Set<string>>();
  for (const row of legacyApps ?? []) {
    if (!row.job_posting_id || !row.id) continue;
    const set = seenByJob.get(row.job_posting_id) ?? new Set<string>();
    set.add(row.id);
    seenByJob.set(row.job_posting_id, set);
  }
  for (const row of jobApps ?? []) {
    if (!row.job_id || !row.id) continue;
    const set = seenByJob.get(row.job_id) ?? new Set<string>();
    set.add(row.id);
    seenByJob.set(row.job_id, set);
  }

  const counts: Record<string, number> = {};
  for (const [jobId, ids] of seenByJob.entries()) {
    counts[jobId] = ids.size;
  }
  return counts;
}

export async function fetchJobHeadcountSummary(
  jobId: string,
): Promise<JobHeadcountSummary | null> {
  const admin = getAdminClient();
  const [{ data: job }, onlineMap] = await Promise.all([
    admin
      .from("job_postings")
      .select("id, slots, hired_walkin_count")
      .eq("id", jobId)
      .maybeSingle<{ id: string; slots: number | null; hired_walkin_count: number | null }>(),
    fetchOnlineHiredCountsByJob([jobId]),
  ]);

  if (!job) return null;

  return computeJobHeadcount({
    slots: job.slots,
    onlineHiredCount: onlineMap[jobId] ?? 0,
    hiredWalkinCount: job.hired_walkin_count ?? 0,
  });
}

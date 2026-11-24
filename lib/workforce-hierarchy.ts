import {
  JOB_LEVEL_LABELS,
  JOB_LEVEL_PRIORITY,
  type JobLevel,
} from "@/lib/rbac/permissions";

export type { JobLevel };
export { JOB_LEVEL_LABELS, JOB_LEVEL_PRIORITY };

export interface SupervisorCandidate {
  id: string;
  tenant_id: string | null;
  department_id: string | null;
  department_name: string | null;
  job_title: string;
  job_level: JobLevel;
  employment_status: string;
  full_name: string;
}

const VALID_JOB_LEVELS = new Set<string>(["staff", "team_lead", "supervisor", "manager"]);

export function normalizeJobLevel(value: string | null | undefined): JobLevel {
  if (typeof value === "string" && VALID_JOB_LEVELS.has(value)) {
    return value as JobLevel;
  }
  return "staff";
}

/**
 * Filters and sorts `Reports To` supervisor/team-lead candidates:
 * - Active employees only (`employment_status === 'active'`)
 * - Same `tenant_id` (when provided)
 * - Excludes the target employee (`id !== currentEmployeeId`)
 * - Sorted by `JOB_LEVEL_PRIORITY` (manager -> supervisor -> team_lead -> staff),
 *   then same `department_id` first, then alphabetical by full name.
 */
export function filterAndSortSupervisorCandidates(
  candidates: SupervisorCandidate[],
  options: {
    currentEmployeeId: string;
    tenantId: string | null;
    departmentId: string | null;
  },
): SupervisorCandidate[] {
  const { currentEmployeeId, tenantId, departmentId } = options;

  return candidates
    .filter((candidate) => {
      if (candidate.id === currentEmployeeId) return false;
      if (candidate.employment_status !== "active") return false;
      if (tenantId && candidate.tenant_id !== tenantId) return false;
      return true;
    })
    .sort((a, b) => {
      const priorityDiff =
        JOB_LEVEL_PRIORITY[normalizeJobLevel(a.job_level)] -
        JOB_LEVEL_PRIORITY[normalizeJobLevel(b.job_level)];
      if (priorityDiff !== 0) return priorityDiff;

      if (departmentId) {
        const aSameDept = a.department_id === departmentId;
        const bSameDept = b.department_id === departmentId;
        if (aSameDept !== bSameDept) {
          return aSameDept ? -1 : 1;
        }
      }

      return a.full_name.localeCompare(b.full_name);
    });
}

export const DEACTIVATING_EMPLOYMENT_STATUSES = new Set<string>([
  "inactive",
  "separated",
  "terminated",
]);

export function requiresDirectReportsReassignment(
  nextStatus: string,
  activeDirectReportsCount: number,
): boolean {
  return (
    activeDirectReportsCount > 0 &&
    DEACTIVATING_EMPLOYMENT_STATUSES.has(nextStatus.trim().toLowerCase())
  );
}

export function getJobLevelBadgeClasses(level: JobLevel): string {
  switch (level) {
    case "manager":
      return "bg-indigo-50 text-[#1E1B4B] border-indigo-200";
    case "supervisor":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "team_lead":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "staff":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

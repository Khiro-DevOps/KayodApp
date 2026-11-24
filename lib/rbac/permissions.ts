export type HrSubRole =
  | "hr_admin"
  | "hr_generalist"
  | "recruiter"
  | "payroll_officer";

export type JobLevel = "staff" | "team_lead" | "supervisor" | "manager";

export const HR_SUB_ROLES: readonly HrSubRole[] = [
  "hr_admin",
  "hr_generalist",
  "recruiter",
  "payroll_officer",
] as const;

export const HR_ROLE_LABELS: Record<HrSubRole, string> = {
  hr_admin: "HR Admin",
  hr_generalist: "HR Generalist",
  recruiter: "Recruiter",
  payroll_officer: "Payroll Officer",
};

export const HR_ROLE_DESCRIPTIONS: Record<HrSubRole, string> = {
  hr_admin:
    "Full workspace authority across recruitment, workforce management, attendance, payroll, and role settings.",
  hr_generalist:
    "Manages workforce operations, leave approvals, offer approvals, hire confirmations, and employee relations.",
  recruiter:
    "Manages job postings, applicant pipelines, interviews, and draft offers.",
  payroll_officer:
    "Manages attendance operations, payroll runs, and payslips with read-only workforce and leave access.",
};

export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  manager: "Manager",
  supervisor: "Supervisor",
  team_lead: "Team Lead",
  staff: "Staff",
};

export const JOB_LEVEL_PRIORITY: Record<JobLevel, number> = {
  manager: 1,
  supervisor: 2,
  team_lead: 3,
  staff: 4,
};

export type Permission =
  | "jobs:manage"
  | "jobs:view"
  | "ats:manage"
  | "ats:view"
  | "interviews:conduct"
  | "offers:draft"
  | "offers:approve_and_send"
  | "hires:confirm"
  | "workforce:manage"
  | "workforce:view"
  | "leaves:final_approve"
  | "leaves:view"
  | "ir:manage"
  | "attendance:manage"
  | "attendance:view"
  | "payroll:manage"
  | "settings:manage_roles"
  | "settings:view";

const ALL_PERMISSIONS: readonly Permission[] = [
  "jobs:manage",
  "jobs:view",
  "ats:manage",
  "ats:view",
  "interviews:conduct",
  "offers:draft",
  "offers:approve_and_send",
  "hires:confirm",
  "workforce:manage",
  "workforce:view",
  "leaves:final_approve",
  "leaves:view",
  "ir:manage",
  "attendance:manage",
  "attendance:view",
  "payroll:manage",
  "settings:manage_roles",
  "settings:view",
];

export const ROLE_PERMISSIONS: Record<HrSubRole, readonly Permission[]> = {
  hr_admin: ALL_PERMISSIONS,
  hr_generalist: [
    "jobs:view",
    "ats:view",
    "interviews:conduct",
    "offers:draft",
    "offers:approve_and_send",
    "hires:confirm",
    "workforce:manage",
    "workforce:view",
    "leaves:final_approve",
    "leaves:view",
    "ir:manage",
    "attendance:view",
    "settings:view",
  ],
  recruiter: [
    "jobs:manage",
    "jobs:view",
    "ats:manage",
    "ats:view",
    "interviews:conduct",
    "offers:draft",
  ],
  payroll_officer: [
    "workforce:view",
    "leaves:view",
    "attendance:manage",
    "attendance:view",
    "payroll:manage",
  ],
};

const ROLE_PERMISSION_SETS: Record<HrSubRole, ReadonlySet<Permission>> = {
  hr_admin: new Set(ROLE_PERMISSIONS.hr_admin),
  hr_generalist: new Set(ROLE_PERMISSIONS.hr_generalist),
  recruiter: new Set(ROLE_PERMISSIONS.recruiter),
  payroll_officer: new Set(ROLE_PERMISSIONS.payroll_officer),
};

const VALID_HR_ROLES = new Set<string>(HR_SUB_ROLES);

export function isHrSubRole(value: string | null | undefined): value is HrSubRole {
  return typeof value === "string" && VALID_HR_ROLES.has(value);
}

/**
 * Resolves the effective HR sub-role for a user.
 * Explicit `hrRole` always takes precedence (including for tenant owners so role
 * switching and explicit role assignments work as expected).
 * Falls back to `hr_admin` when `hrRole` is unset/unknown.
 */
export function resolveEffectiveHrRole(
  hrRole?: string | null,
  _isTenantOwner?: boolean | null
): HrSubRole {
  const normalized = typeof hrRole === "string" ? hrRole.trim() : "";
  if (isHrSubRole(normalized)) {
    return normalized;
  }
  return "hr_admin";
}

export function canHr(
  hrRole: string | null | undefined,
  permission: Permission,
  isTenantOwner?: boolean | null
): boolean {
  const effective = resolveEffectiveHrRole(hrRole, isTenantOwner);
  return ROLE_PERMISSION_SETS[effective].has(permission);
}

export function getDefaultHrLandingPath(
  hrRole?: string | null,
  isTenantOwner?: boolean | null
): string {
  const effective = resolveEffectiveHrRole(hrRole, isTenantOwner);
  switch (effective) {
    case "recruiter":
      return "/hr/jobs";
    case "payroll_officer":
      return "/hr/payroll";
    case "hr_generalist":
      return "/hr/employees";
    case "hr_admin":
    default:
      return "/hr";
  }
}

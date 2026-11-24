import { describe, expect, it } from "vitest";
import {
  canHr,
  getDefaultHrLandingPath,
  HR_ROLE_DESCRIPTIONS,
  HR_ROLE_LABELS,
  JOB_LEVEL_LABELS,
  JOB_LEVEL_PRIORITY,
  resolveEffectiveHrRole,
  ROLE_PERMISSIONS,
} from "./permissions";

describe("RBAC permissions", () => {
  it("honors explicit hr_role even when is_tenant_owner is true, and falls back to hr_admin when null", () => {
    expect(resolveEffectiveHrRole("recruiter", true)).toBe("recruiter");
    expect(resolveEffectiveHrRole("payroll_officer", true)).toBe("payroll_officer");
    expect(resolveEffectiveHrRole("hr_generalist", true)).toBe("hr_generalist");
    expect(resolveEffectiveHrRole(null, true)).toBe("hr_admin");
  });

  it("resolves valid sub-roles and defaults null/unknown to hr_admin", () => {
    expect(resolveEffectiveHrRole("hr_generalist", false)).toBe("hr_generalist");
    expect(resolveEffectiveHrRole("recruiter", false)).toBe("recruiter");
    expect(resolveEffectiveHrRole("payroll_officer", false)).toBe("payroll_officer");
    expect(resolveEffectiveHrRole(null, false)).toBe("hr_admin");
    expect(resolveEffectiveHrRole("unknown_role", false)).toBe("hr_admin");
  });

  it("grants hr_admin all permissions and honors explicit sub-role for tenant owners", () => {
    for (const perm of ROLE_PERMISSIONS.hr_admin) {
      expect(canHr("hr_admin", perm, false)).toBe(true);
      expect(canHr(null, perm, true)).toBe(true);
    }
    expect(canHr("recruiter", "payroll:manage", true)).toBe(false);
    expect(canHr("recruiter", "jobs:manage", true)).toBe(true);
  });

  it("enforces recruiter boundaries", () => {
    expect(canHr("recruiter", "jobs:manage")).toBe(true);
    expect(canHr("recruiter", "ats:manage")).toBe(true);
    expect(canHr("recruiter", "interviews:conduct")).toBe(true);
    expect(canHr("recruiter", "offers:draft")).toBe(true);

    expect(canHr("recruiter", "offers:approve_and_send")).toBe(false);
    expect(canHr("recruiter", "hires:confirm")).toBe(false);
    expect(canHr("recruiter", "payroll:manage")).toBe(false);
    expect(canHr("recruiter", "workforce:view")).toBe(false);
    expect(canHr("recruiter", "settings:manage_roles")).toBe(false);
  });

  it("enforces payroll_officer boundaries", () => {
    expect(canHr("payroll_officer", "payroll:manage")).toBe(true);
    expect(canHr("payroll_officer", "attendance:manage")).toBe(true);
    expect(canHr("payroll_officer", "workforce:view")).toBe(true);
    expect(canHr("payroll_officer", "leaves:view")).toBe(true);

    expect(canHr("payroll_officer", "jobs:view")).toBe(false);
    expect(canHr("payroll_officer", "ats:view")).toBe(false);
    expect(canHr("payroll_officer", "workforce:manage")).toBe(false);
    expect(canHr("payroll_officer", "settings:view")).toBe(false);
  });

  it("enforces hr_generalist boundaries", () => {
    expect(canHr("hr_generalist", "workforce:manage")).toBe(true);
    expect(canHr("hr_generalist", "leaves:final_approve")).toBe(true);
    expect(canHr("hr_generalist", "offers:approve_and_send")).toBe(true);
    expect(canHr("hr_generalist", "hires:confirm")).toBe(true);
    expect(canHr("hr_generalist", "settings:view")).toBe(true);

    expect(canHr("hr_generalist", "payroll:manage")).toBe(false);
    expect(canHr("hr_generalist", "jobs:manage")).toBe(false);
    expect(canHr("hr_generalist", "settings:manage_roles")).toBe(false);
  });

  it("returns expected default landing paths", () => {
    expect(getDefaultHrLandingPath("recruiter")).toBe("/hr/jobs");
    expect(getDefaultHrLandingPath("payroll_officer")).toBe("/hr/payroll");
    expect(getDefaultHrLandingPath("hr_generalist")).toBe("/hr/employees");
    expect(getDefaultHrLandingPath("hr_admin")).toBe("/hr");
    expect(getDefaultHrLandingPath("recruiter", true)).toBe("/hr/jobs");
    expect(getDefaultHrLandingPath(null, true)).toBe("/hr");
  });

  it("exports job level priority and role metadata", () => {
    expect(JOB_LEVEL_PRIORITY).toEqual({
      manager: 1,
      supervisor: 2,
      team_lead: 3,
      staff: 4,
    });
    expect(Object.keys(JOB_LEVEL_LABELS)).toHaveLength(4);
    expect(Object.keys(HR_ROLE_LABELS)).toHaveLength(4);
    expect(Object.keys(HR_ROLE_DESCRIPTIONS)).toHaveLength(4);
  });
});

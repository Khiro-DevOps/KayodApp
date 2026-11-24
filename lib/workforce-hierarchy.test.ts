import { describe, expect, it } from "vitest";
import {
  filterAndSortSupervisorCandidates,
  normalizeJobLevel,
  requiresDirectReportsReassignment,
  type SupervisorCandidate,
} from "./workforce-hierarchy";

describe("workforce hierarchy helpers", () => {
  const baseCandidates: SupervisorCandidate[] = [
    {
      id: "emp-self",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Senior Engineer",
      job_level: "staff",
      employment_status: "active",
      full_name: "Alex Rivera",
    },
    {
      id: "emp-other-tenant",
      tenant_id: "tenant-2",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Engineering Manager",
      job_level: "manager",
      employment_status: "active",
      full_name: "Blake Cross",
    },
    {
      id: "emp-inactive-sup",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Tech Lead",
      job_level: "supervisor",
      employment_status: "separated",
      full_name: "Casey Former",
    },
    {
      id: "emp-staff-same-dept",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Developer",
      job_level: "staff",
      employment_status: "active",
      full_name: "Dana Staff",
    },
    {
      id: "emp-lead-other-dept",
      tenant_id: "tenant-1",
      department_id: "dept-hr",
      department_name: "HR",
      job_title: "People Lead",
      job_level: "team_lead",
      employment_status: "active",
      full_name: "Evan HR Lead",
    },
    {
      id: "emp-lead-same-dept",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Frontend Lead",
      job_level: "team_lead",
      employment_status: "active",
      full_name: "Fran Eng Lead",
    },
    {
      id: "emp-sup-same-dept",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Engineering Supervisor",
      job_level: "supervisor",
      employment_status: "active",
      full_name: "Gabe Supervisor",
    },
    {
      id: "emp-mgr-other-dept",
      tenant_id: "tenant-1",
      department_id: "dept-ops",
      department_name: "Operations",
      job_title: "Ops Manager",
      job_level: "manager",
      employment_status: "active",
      full_name: "Hannah Ops Mgr",
    },
    {
      id: "emp-mgr-same-dept",
      tenant_id: "tenant-1",
      department_id: "dept-eng",
      department_name: "Engineering",
      job_title: "Engineering Manager",
      job_level: "manager",
      employment_status: "active",
      full_name: "Ian Eng Mgr",
    },
  ];

  it("filters out self, inactive employees, and other tenants, and sorts by priority then same department", () => {
    const result = filterAndSortSupervisorCandidates(baseCandidates, {
      currentEmployeeId: "emp-self",
      tenantId: "tenant-1",
      departmentId: "dept-eng",
    });

    expect(result.map((c) => c.id)).toEqual([
      "emp-mgr-same-dept",
      "emp-mgr-other-dept",
      "emp-sup-same-dept",
      "emp-lead-same-dept",
      "emp-lead-other-dept",
      "emp-staff-same-dept",
    ]);
  });

  it("filters out staff when leadershipOnly is true, falling back to staff only if zero leadership exist", () => {
    const leadershipResult = filterAndSortSupervisorCandidates(baseCandidates, {
      currentEmployeeId: "emp-self",
      tenantId: "tenant-1",
      departmentId: "dept-eng",
      leadershipOnly: true,
    });
    expect(leadershipResult.map((c) => c.id)).toEqual([
      "emp-mgr-same-dept",
      "emp-mgr-other-dept",
      "emp-sup-same-dept",
      "emp-lead-same-dept",
      "emp-lead-other-dept",
    ]);

    const staffOnlyPool = baseCandidates.filter((c) => c.job_level === "staff");
    const fallbackResult = filterAndSortSupervisorCandidates(staffOnlyPool, {
      currentEmployeeId: "emp-self",
      tenantId: "tenant-1",
      departmentId: "dept-eng",
      leadershipOnly: true,
    });
    expect(fallbackResult.map((c) => c.id)).toEqual(["emp-staff-same-dept"]);
  });

  it("normalizes unknown job levels to staff", () => {
    expect(normalizeJobLevel("manager")).toBe("manager");
    expect(normalizeJobLevel("supervisor")).toBe("supervisor");
    expect(normalizeJobLevel("team_lead")).toBe("team_lead");
    expect(normalizeJobLevel("staff")).toBe("staff");
    expect(normalizeJobLevel("unknown")).toBe("staff");
    expect(normalizeJobLevel(null)).toBe("staff");
  });

  it("requires reassignment warning when deactivating an employee with active direct reports", () => {
    expect(requiresDirectReportsReassignment("inactive", 2)).toBe(true);
    expect(requiresDirectReportsReassignment("separated", 1)).toBe(true);
    expect(requiresDirectReportsReassignment("terminated", 1)).toBe(true);
    expect(requiresDirectReportsReassignment("active", 3)).toBe(false);
    expect(requiresDirectReportsReassignment("on_leave", 3)).toBe(false);
    expect(requiresDirectReportsReassignment("inactive", 0)).toBe(false);
    expect(requiresDirectReportsReassignment("separated", 0)).toBe(false);
  });
});

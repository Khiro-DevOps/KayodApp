import { describe, expect, it } from "vitest";
import { getRoleHome, safeNext } from "./safe-redirect";

describe("getRoleHome", () => {
  it("maps roles to their expected homes", () => {
    expect(getRoleHome("candidate")).toBe("/applicant/dashboard");
    expect(getRoleHome("employee")).toBe("/employee/dashboard");
    expect(getRoleHome("hr")).toBe("/hr");
    expect(getRoleHome("hr_manager")).toBe("/hr");
    expect(getRoleHome("admin")).toBe("/hr");
  });
});

describe("safeNext", () => {
  it("allows safe relative paths", () => {
    expect(safeNext("/jobs/123", "candidate")).toBe("/jobs/123");
    expect(safeNext("/jobs/123?tab=details", null)).toBe("/jobs/123?tab=details");
    expect(safeNext("/applicant/jobs/123/apply", "candidate")).toBe(
      "/applicant/jobs/123/apply"
    );
    expect(safeNext("/hr/jobs", "hr_manager")).toBe("/hr/jobs");
    expect(safeNext("/hr", "hr")).toBe("/hr");
    expect(safeNext("/hr", "admin")).toBe("/hr");
    expect(safeNext("/employee/payslips", "employee")).toBe("/employee/payslips");
  });

  it("rejects protocol-relative URLs, schemes, backslashes, and control characters", () => {
    expect(safeNext("//evil.com", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("https://evil.com", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("/\\evil.com", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("/jobs\nLocation: evil", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("javascript:alert(1)", "hr_manager")).toBe("/hr");
  });

  it("rejects protected prefixes of another role", () => {
    expect(safeNext("/hr", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("/hr/jobs", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("/employee/dashboard", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("/applicant/dashboard", "hr_manager")).toBe("/hr");
    expect(safeNext("/applicant/jobs", "employee")).toBe("/employee/dashboard");
  });

  it("returns role home for empty or missing values", () => {
    expect(safeNext("", "candidate")).toBe("/applicant/dashboard");
    expect(safeNext("   ", "employee")).toBe("/employee/dashboard");
    expect(safeNext(null, "hr_manager")).toBe("/hr");
    expect(safeNext(undefined, "admin")).toBe("/hr");
  });
});

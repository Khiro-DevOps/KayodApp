import { describe, expect, it } from "vitest";
import {
  canIssueNte,
  canResolveCase,
  canSubmitExplanation,
  computeNteDeadline,
  getNteCountdown,
} from "./incident-reports";
import {
  generateNoticeOfDecisionPdf,
  generateNoticeToExplainPdf,
  stampEmployeeAcknowledgmentOnPdf,
} from "./disciplinary-pdf";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("incident-reports domain helpers", () => {
  it("computes the exact 5-calendar-day NTE deadline", () => {
    const issuedAt = new Date("2026-11-25T08:00:00.000Z");
    const deadline = computeNteDeadline(issuedAt);
    expect(deadline.toISOString()).toBe("2026-11-30T08:00:00.000Z");
  });

  it("detects remaining time and overdue status accurately", () => {
    const deadline = new Date("2026-11-30T08:00:00.000Z");

    const before = getNteCountdown(
      deadline,
      new Date("2026-11-28T02:00:00.000Z")
    );
    expect(before.isOverdue).toBe(false);
    expect(before.remainingDays).toBe(2);
    expect(before.remainingHours).toBe(6);

    const after = getNteCountdown(
      deadline,
      new Date("2026-12-01T10:00:00.000Z")
    );
    expect(after.isOverdue).toBe(true);
    expect(after.remainingDays).toBe(0);
    expect(after.label).toContain("Overdue");
  });

  it("enforces NTE issuance and employee explanation state machine guards", () => {
    expect(canIssueNte("draft")).toBe(true);
    expect(canIssueNte("nte_issued")).toBe(false);
    expect(canIssueNte("explanation_submitted")).toBe(false);

    expect(canSubmitExplanation("nte_issued")).toBe(true);
    expect(canSubmitExplanation("draft")).toBe(false);
    expect(canSubmitExplanation("explanation_submitted")).toBe(false);
    expect(canSubmitExplanation("resolved")).toBe(false);
    expect(canSubmitExplanation("dismissed")).toBe(false);
  });

  it("enforces twin-notice resolution guards before and after the 5-day deadline", () => {
    const issuedAt = new Date("2026-11-25T08:00:00.000Z");
    const deadlineAt = computeNteDeadline(issuedAt);

    // Blocked in draft
    expect(canResolveCase("draft", null).allowed).toBe(false);

    // Blocked while within the 5-day NTE window without explanation
    const duringWindow = canResolveCase(
      "nte_issued",
      deadlineAt,
      new Date("2026-11-27T08:00:00.000Z")
    );
    expect(duringWindow.allowed).toBe(false);

    // Allowed after 5-day NTE window has lapsed
    const afterWindow = canResolveCase(
      "nte_issued",
      deadlineAt,
      new Date("2026-11-30T08:00:01.000Z")
    );
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.isLapsedWithoutResponse).toBe(true);

    // Allowed once employee explanation is submitted
    const withExplanation = canResolveCase(
      "explanation_submitted",
      deadlineAt,
      new Date("2026-11-26T08:00:00.000Z")
    );
    expect(withExplanation.allowed).toBe(true);
    expect(withExplanation.isLapsedWithoutResponse).toBe(false);

    // Blocked once already closed
    expect(canResolveCase("resolved", deadlineAt).allowed).toBe(false);
    expect(canResolveCase("dismissed", deadlineAt).allowed).toBe(false);
  });
});

describe("disciplinary PDF generators & signature stamping", () => {
  it("generateNoticeToExplainPdf embeds HR signature PNG and returns a valid %PDF- buffer + SHA-256 hash", async () => {
    const result = await generateNoticeToExplainPdf({
      tenantName: "Kayod Demo Corp",
      tenantAddress: "Makati City, Metro Manila",
      caseNumber: "IR-2026-0001",
      issuedAt: "2026-11-25T08:00:00.000Z",
      deadlineAt: "2026-11-30T08:00:00.000Z",
      employeeName: "Juan Dela Cruz",
      employeeNumber: "EMP-001",
      employeePosition: "Software Engineer",
      employeeDepartment: "Engineering",
      supervisorName: "Maria Santos",
      incidentDate: "2026-11-24",
      offenseCategory: "Attendance / Tardiness",
      policyViolated: "Employee Handbook Sec. 4.2",
      description:
        "Employee incurred three (3) unexcused tardiness incidents on Nov 18, 20, and 24, 2026.",
      issuedByName: "Ana Reyes",
      issuedByTitle: "HR Admin",
      hrSignaturePngBase64: SAMPLE_PNG_DATA_URL,
      hrSignatoryName: "Ana Reyes",
      hrSignedAt: "2026-11-25T08:00:00.000Z",
    });

    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.pdfBytes.length).toBeGreaterThan(500);
    const header = new TextDecoder().decode(result.pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generateNoticeOfDecisionPdf embeds HR signature PNG and returns a valid %PDF- buffer + SHA-256 hash", async () => {
    const result = await generateNoticeOfDecisionPdf({
      tenantName: "Kayod Demo Corp",
      tenantAddress: "Makati City, Metro Manila",
      caseNumber: "IR-2026-0001",
      resolvedAt: "2026-12-01T09:00:00.000Z",
      nteIssuedAt: "2026-11-25T08:00:00.000Z",
      nteAcknowledgedAt: null,
      explanationSubmittedAt: "2026-11-27T14:00:00.000Z",
      lapsedWithoutResponse: false,
      employeeName: "Juan Dela Cruz",
      employeeNumber: "EMP-001",
      employeePosition: "Software Engineer",
      employeeDepartment: "Engineering",
      incidentDate: "2026-11-24",
      offenseCategory: "Attendance / Tardiness",
      policyViolated: "Employee Handbook Sec. 4.2",
      sanctionType: "written_warning",
      resolutionNotes:
        "After reviewing the attendance logs and written explanation, a formal Written Warning is issued.",
      resolvedByName: "Ana Reyes",
      resolvedByTitle: "HR Admin",
      hrSignaturePngBase64: SAMPLE_PNG_DATA_URL,
      hrSignatoryName: "Ana Reyes",
      hrSignedAt: "2026-12-01T09:00:00.000Z",
    });

    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.pdfBytes.length).toBeGreaterThan(500);
    const header = new TextDecoder().decode(result.pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stampEmployeeAcknowledgmentOnPdf stamps employee signature PNG onto existing PDF and changes SHA-256 hash", async () => {
    const initial = await generateNoticeToExplainPdf({
      tenantName: "Kayod Demo Corp",
      caseNumber: "IR-2026-0002",
      issuedAt: "2026-11-25T08:00:00.000Z",
      deadlineAt: "2026-11-30T08:00:00.000Z",
      employeeName: "Juan Dela Cruz",
      employeePosition: "Software Engineer",
      employeeDepartment: "Engineering",
      incidentDate: "2026-11-24",
      offenseCategory: "Policy Violation",
      description: "Missed mandatory security briefing without prior notice.",
      issuedByName: "Ana Reyes",
      hrSignaturePngBase64: SAMPLE_PNG_DATA_URL,
      hrSignatoryName: "Ana Reyes",
      hrSignedAt: "2026-11-25T08:00:00.000Z",
    });

    const stamped = await stampEmployeeAcknowledgmentOnPdf({
      existingPdfBytes: initial.pdfBytes,
      employeeSignaturePngBase64: SAMPLE_PNG_DATA_URL,
      employeeName: "Juan Dela Cruz",
      acknowledgedAt: "2026-11-25T10:30:00.000Z",
      caseNumber: "IR-2026-0002",
      noticeType: "nte",
    });

    expect(stamped.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(stamped.pdfBytes.length).toBeGreaterThan(initial.pdfBytes.length);
    const header = new TextDecoder().decode(stamped.pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(stamped.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stamped.sha256).not.toBe(initial.sha256);
  });
});

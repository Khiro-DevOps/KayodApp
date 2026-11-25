import { getAdminClient } from "@/lib/supabase/admin";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import IncidentsClient, {
  type HrEmployeeOption,
  type IncidentCaseRow,
} from "./incidents-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Incident Reports & NTE | Kayod HR",
  description:
    "Manage employee incident reports, 5-day Notices to Explain, and Notices of Decision.",
};

export default async function HrIncidentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const ctx = await requireHrPermission("ir:manage");
  const resolvedParams = searchParams ? await searchParams : {};
  const initialCaseId =
    typeof resolvedParams.case === "string" ? resolvedParams.case : null;

  const admin = getAdminClient();
  const tenantId = ctx.tenant_id;

  let casesQuery = admin
    .from("incident_reports")
    .select(
      `
      *,
      employee:employees!employee_id(
        id,
        employee_number,
        job_title,
        department:departments!department_id(name),
        profile:profiles!profile_id(first_name, last_name, email)
      )
    `
    )
    .order("created_at", { ascending: false });

  if (tenantId) {
    casesQuery = casesQuery.eq("tenant_id", tenantId);
  }

  let employeesQuery = admin
    .from("employees")
    .select(
      `
      id,
      employee_number,
      job_title,
      department:departments!department_id(name),
      profile:profiles!profile_id(first_name, last_name)
    `
    )
    .eq("employment_status", "active")
    .order("created_at", { ascending: false });

  if (tenantId) {
    employeesQuery = employeesQuery.eq("tenant_id", tenantId);
  }

  const [{ data: rawCases }, { data: rawEmployees }, { data: hrProfile }] =
    await Promise.all([
      casesQuery,
      employeesQuery,
      admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", ctx.id)
        .maybeSingle<{ first_name?: string | null; last_name?: string | null }>(),
    ]);

  const currentHrName =
    [hrProfile?.first_name, hrProfile?.last_name]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ") || "HR Administration";

  const reporterIds = Array.from(
    new Set(
      (rawCases ?? [])
        .map((c) => (c as { reported_by?: string }).reported_by)
        .filter((id): id is string => Boolean(id))
    )
  );

  const reporterNameById = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: reporters } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", reporterIds);
    for (const r of reporters ?? []) {
      const row = r as {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
      };
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      if (name) reporterNameById.set(row.id, name);
    }
  }

  const cases: IncidentCaseRow[] = (rawCases ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
    const empObj = (emp ?? {}) as Record<string, unknown>;
    const prof = Array.isArray(empObj.profile)
      ? empObj.profile[0]
      : empObj.profile;
    const profObj = (prof ?? {}) as Record<string, unknown>;
    const dept = Array.isArray(empObj.department)
      ? empObj.department[0]
      : empObj.department;
    const deptObj = (dept ?? {}) as Record<string, unknown>;

    const employeeName =
      [profObj.first_name, profObj.last_name]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ") || "Employee";

    return {
      id: String(r.id),
      caseNumber: String(r.case_number),
      employeeId: String(r.employee_id),
      employeeName,
      employeeNumber: (empObj.employee_number as string | null) ?? null,
      employeeJobTitle: (empObj.job_title as string | null) ?? "Staff",
      employeeDepartment: (deptObj.name as string | null) ?? "General",
      reportedByName:
        reporterNameById.get(String(r.reported_by)) ?? "Supervisor / HR",
      incidentDate: String(r.incident_date),
      offenseCategory: String(r.offense_category),
      policyViolated: (r.policy_violated as string | null) ?? null,
      description: String(r.description),
      evidencePaths: Array.isArray(r.evidence_paths)
        ? (r.evidence_paths as string[])
        : [],
      status: String(r.status) as IncidentCaseRow["status"],
      nteIssuedAt: (r.nte_issued_at as string | null) ?? null,
      nteDeadlineAt: (r.nte_deadline_at as string | null) ?? null,
      nteDocumentPath: (r.nte_document_path as string | null) ?? null,
      nteHrSignatureName: (r.nte_hr_signature_name as string | null) ?? null,
      nteHrSignedAt: (r.nte_hr_signed_at as string | null) ?? null,
      nteAcknowledgedAt: (r.nte_acknowledged_at as string | null) ?? null,
      nteDocumentSha256: (r.nte_document_sha256 as string | null) ?? null,
      employeeExplanation: (r.employee_explanation as string | null) ?? null,
      explanationSubmittedAt:
        (r.explanation_submitted_at as string | null) ?? null,
      explanationAttachments: Array.isArray(r.explanation_attachments)
        ? (r.explanation_attachments as string[])
        : [],
      sanctionType: (r.sanction_type as IncidentCaseRow["sanctionType"]) ?? null,
      suspensionDays: (r.suspension_days as number | null) ?? null,
      suspensionStartDate: (r.suspension_start_date as string | null) ?? null,
      suspensionEndDate: (r.suspension_end_date as string | null) ?? null,
      resolutionNotes: (r.resolution_notes as string | null) ?? null,
      decisionDocumentPath: (r.decision_document_path as string | null) ?? null,
      decisionHrSignatureName:
        (r.decision_hr_signature_name as string | null) ?? null,
      decisionHrSignedAt: (r.decision_hr_signed_at as string | null) ?? null,
      decisionAcknowledgedAt:
        (r.decision_acknowledged_at as string | null) ?? null,
      decisionDocumentSha256:
        (r.decision_document_sha256 as string | null) ?? null,
      resolvedAt: (r.resolved_at as string | null) ?? null,
      createdAt: String(r.created_at),
    };
  });

  const employeeOptions: HrEmployeeOption[] = (rawEmployees ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const profObj = (prof ?? {}) as Record<string, unknown>;
    const dept = Array.isArray(r.department) ? r.department[0] : r.department;
    const deptObj = (dept ?? {}) as Record<string, unknown>;
    const fullName =
      [profObj.first_name, profObj.last_name]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ") || "Employee";
    return {
      id: String(r.id),
      fullName,
      employeeNumber: (r.employee_number as string | null) ?? null,
      jobTitle: (r.job_title as string | null) ?? "Staff",
      departmentName: (deptObj.name as string | null) ?? "General",
    };
  });

  return (
    <PageContainer>
      <IncidentsClient
        initialCases={cases}
        employees={employeeOptions}
        initialCaseId={initialCaseId}
        currentHrName={currentHrName}
      />
    </PageContainer>
  );
}

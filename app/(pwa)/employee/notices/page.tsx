import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import PageContainer from "@/components/ui/page-container";
import NoticesClient, { type EmployeeNoticeItem } from "./notices-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Disciplinary Notices | Kayod",
  description:
    "View Notices to Explain, submit your written explanation, and review final Notices of Decision.",
};

export default async function EmployeeNoticesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const initialCaseId =
    typeof resolvedParams.case === "string" ? resolvedParams.case : null;

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, profile:profiles!profile_id(first_name, last_name)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!employee) {
    redirect("/employee/dashboard");
  }

  const empProf = Array.isArray(employee.profile)
    ? employee.profile[0]
    : employee.profile;
  const employeeName =
    [empProf?.first_name, empProf?.last_name]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ") || "Employee";

  const baseSelect =
    "id, case_number, incident_date, offense_category, policy_violated, description, evidence_paths, status, nte_issued_at, nte_deadline_at, nte_document_path, employee_explanation, explanation_submitted_at, explanation_attachments, sanction_type, suspension_days, suspension_start_date, suspension_end_date, resolution_notes, decision_document_path, resolved_at, created_at";
  const extendedSelect = `${baseSelect}, nte_hr_signature_name, nte_hr_signed_at, nte_acknowledged_at, nte_document_sha256, decision_hr_signature_name, decision_hr_signed_at, decision_acknowledged_at, decision_document_sha256`;

  // Employees must NEVER see 'draft' incident reports
  const primaryRes = await admin
    .from("incident_reports")
    .select(extendedSelect)
    .eq("employee_id", employee.id)
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  let rows = primaryRes.data as Array<Record<string, unknown>> | null;
  if (primaryRes.error) {
    console.warn(
      "[EmployeeNoticesPage] Extended signature columns query failed; falling back to base columns. Apply migration 20261207_phase3_ir_pdf_signatures.sql.",
      primaryRes.error.message
    );
    const fallbackRes = await admin
      .from("incident_reports")
      .select(baseSelect)
      .eq("employee_id", employee.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    rows = fallbackRes.data as Array<Record<string, unknown>> | null;
  }

  const notices: EmployeeNoticeItem[] = (rows ?? []).map((r) => ({
    id: String(r.id),
    caseNumber: String(r.case_number),
    incidentDate: String(r.incident_date),
    offenseCategory: String(r.offense_category),
    policyViolated: (r.policy_violated as string | null) ?? null,
    description: String(r.description),
    evidencePaths: Array.isArray(r.evidence_paths)
      ? (r.evidence_paths as string[])
      : [],
    status: r.status as EmployeeNoticeItem["status"],
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
    sanctionType:
      (r.sanction_type as EmployeeNoticeItem["sanctionType"]) ?? null,
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
  }));

  return (
    <PageContainer>
      <NoticesClient
        notices={notices}
        initialCaseId={initialCaseId}
        employeeName={employeeName}
      />
    </PageContainer>
  );
}

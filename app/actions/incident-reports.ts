"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { canHr } from "@/lib/rbac/permissions";
import { getHrSessionContext } from "@/lib/rbac/server";
import { sendNotification } from "@/lib/notifications";
import {
  DISCIPLINARY_SANCTIONS,
  OFFENSE_CATEGORIES,
  canIssueNte,
  canResolveCase,
  canSubmitExplanation,
  computeNteDeadline,
  type DisciplinarySanction,
  type IncidentStatus,
} from "@/lib/incident-reports";
import {
  generateNoticeOfDecisionPdf,
  generateNoticeToExplainPdf,
  stampEmployeeAcknowledgmentOnPdf,
} from "@/lib/disciplinary-pdf";

const DISCIPLINARY_BUCKET = "disciplinary-docs";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file

const INCIDENT_REVALIDATE_PATHS = [
  "/hr/incidents",
  "/employee/dashboard",
  "/employee/notices",
  "/employee/team",
];

function revalidateIncidentPaths() {
  for (const path of INCIDENT_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "attachment";
}

export interface ActionResult<T = undefined> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

const createIncidentSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID."),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Incident date must be YYYY-MM-DD."),
  offenseCategory: z.enum(OFFENSE_CATEGORIES),
  policyViolated: z.string().trim().max(300).optional(),
  description: z
    .string()
    .trim()
    .min(10, "Please provide a detailed description (at least 10 characters).")
    .max(5000),
});

const pngDataUrlSchema = z
  .string()
  .trim()
  .regex(
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
    "Please provide a valid digital signature."
  )
  .max(500_000, "Signature image is too large.");

const issueNteSchema = z.object({
  caseId: z.string().uuid("Invalid case ID."),
  hrSignatureDataUrl: pngDataUrlSchema.optional(),
});

const acknowledgeNoticeSchema = z.object({
  incidentId: z.string().uuid("Invalid case ID."),
  noticeType: z.enum(["nte", "decision"]),
  signatureDataUrl: pngDataUrlSchema,
});

const explanationSchema = z.object({
  caseId: z.string().uuid("Invalid case ID."),
  explanation: z
    .string()
    .trim()
    .min(10, "Please provide a written explanation of at least 10 characters.")
    .max(8000),
});

const resolveIncidentSchema = z
  .object({
    caseId: z.string().uuid("Invalid case ID."),
    outcome: z.enum(["resolved", "dismissed"]),
    sanctionType: z.enum(DISCIPLINARY_SANCTIONS),
    suspensionDays: z.number().int().min(1).max(30).nullable().optional(),
    suspensionStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    suspensionEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    resolutionNotes: z
      .string()
      .trim()
      .min(10, "Please provide findings & resolution notes (at least 10 characters).")
      .max(6000),
    hrSignatureDataUrl: pngDataUrlSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.sanctionType === "suspension" && !val.suspensionDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Suspension days (1-30) are required for a suspension sanction.",
        path: ["suspensionDays"],
      });
    }
    if (val.outcome === "dismissed" && val.sanctionType !== "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dismissed cases must have 'No Sanction / Exonerated' selected.",
        path: ["sanctionType"],
      });
    }
  });

const signedUrlSchema = z.object({
  caseId: z.string().uuid("Invalid case ID."),
  filePath: z.string().trim().min(1, "File path is required."),
});

async function notifyTenantHrAdmins(params: {
  tenantId: string;
  senderId: string;
  title: string;
  body: string;
  actionUrl: string;
}) {
  const admin = getAdminClient();
  const { data: hrProfiles } = await admin
    .from("profiles")
    .select("id, hr_role, role")
    .eq("tenant_id", params.tenantId)
    .in("role", ["hr_manager", "hr", "admin"]);

  const recipients = (hrProfiles ?? []).filter((p) => {
    const hrRole = (p as { hr_role?: string | null }).hr_role ?? "hr_admin";
    return hrRole === "hr_admin" || hrRole === "hr_generalist";
  });

  await Promise.all(
    recipients.map((r) =>
      sendNotification({
        recipientId: (r as { id: string }).id,
        senderId: params.senderId,
        type: "general",
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        actionName: "notifyTenantHrAdmins",
      })
    )
  );
}

async function uploadFilesToBucket(
  files: File[],
  folderPrefix: string
): Promise<{ paths: string[]; error?: string }> {
  const admin = getAdminClient();
  const uploaded: string[] = [];

  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        paths: uploaded,
        error: `File "${file.name}" exceeds the 10 MB limit.`,
      };
    }

    const safeName = sanitizeFileName(file.name);
    const objectPath = `${folderPrefix}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(DISCIPLINARY_BUCKET)
      .upload(objectPath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return {
        paths: uploaded,
        error: `Failed to upload "${file.name}": ${uploadError.message}`,
      };
    }

    uploaded.push(objectPath);
  }

  return { paths: uploaded };
}

export async function createIncidentReportAction(
  formData: FormData
): Promise<ActionResult<{ id: string; caseNumber: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = createIncidentSchema.safeParse({
    employeeId: String(formData.get("employeeId") ?? ""),
    incidentDate: String(formData.get("incidentDate") ?? ""),
    offenseCategory: String(formData.get("offenseCategory") ?? ""),
    policyViolated: String(formData.get("policyViolated") ?? "") || undefined,
    description: String(formData.get("description") ?? ""),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid incident report data.",
    };
  }

  const admin = getAdminClient();
  const hrCtx = await getHrSessionContext();
  const isAuthorizedHr =
    Boolean(hrCtx) &&
    canHr(hrCtx?.hr_role, "ir:manage", hrCtx?.is_tenant_owner);

  // Fetch target employee
  const { data: targetEmployee } = await admin
    .from("employees")
    .select(
      "id, tenant_id, reports_to, profile_id, profile:profiles!profile_id(first_name, last_name)"
    )
    .eq("id", parsed.data.employeeId)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      reports_to: string | null;
      profile_id: string | null;
      profile?:
        | { first_name?: string | null; last_name?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null }>
        | null;
    }>();

  if (!targetEmployee || !targetEmployee.tenant_id) {
    return { success: false, error: "Target employee not found." };
  }

  let filedBySupervisor = false;

  if (isAuthorizedHr) {
    if (hrCtx?.tenant_id && hrCtx.tenant_id !== targetEmployee.tenant_id) {
      return { success: false, error: "Cross-tenant access denied." };
    }
  } else {
    // Check if caller is direct supervisor of targetEmployee
    const { data: callerEmployee } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("profile_id", user.id)
      .eq("employment_status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; tenant_id: string | null }>();

    if (
      !callerEmployee ||
      targetEmployee.reports_to !== callerEmployee.id ||
      (callerEmployee.tenant_id &&
        callerEmployee.tenant_id !== targetEmployee.tenant_id)
    ) {
      return {
        success: false,
        error:
          "You do not have permission to file an incident report for this employee.",
      };
    }
    filedBySupervisor = true;
  }

  const { data: inserted, error: insertError } = await admin
    .from("incident_reports")
    .insert({
      tenant_id: targetEmployee.tenant_id,
      case_number: "",
      employee_id: targetEmployee.id,
      reported_by: user.id,
      incident_date: parsed.data.incidentDate,
      offense_category: parsed.data.offenseCategory,
      policy_violated: parsed.data.policyViolated ?? null,
      description: parsed.data.description,
      status: "draft",
    })
    .select("id, case_number")
    .single<{ id: string; case_number: string }>();

  if (insertError || !inserted) {
    return {
      success: false,
      error: insertError?.message ?? "Failed to create incident report.",
    };
  }

  const rawFiles = formData
    .getAll("evidence")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (rawFiles.length > 0) {
    const uploadRes = await uploadFilesToBucket(
      rawFiles,
      `${targetEmployee.tenant_id}/cases/${inserted.id}/evidence`
    );
    if (uploadRes.error) {
      return {
        success: false,
        error: uploadRes.error,
      };
    }
    if (uploadRes.paths.length > 0) {
      await admin
        .from("incident_reports")
        .update({ evidence_paths: uploadRes.paths })
        .eq("id", inserted.id);
    }
  }

  if (filedBySupervisor) {
    const empProf = Array.isArray(targetEmployee.profile)
      ? targetEmployee.profile[0]
      : targetEmployee.profile;
    const empName =
      [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ") ||
      "an employee";

    await notifyTenantHrAdmins({
      tenantId: targetEmployee.tenant_id,
      senderId: user.id,
      title: `New Incident Report (${inserted.case_number})`,
      body: `A supervisor filed a draft incident report regarding ${empName} (${parsed.data.offenseCategory}). Review to issue a Notice to Explain.`,
      actionUrl: `/hr/incidents?case=${inserted.id}`,
    });
  }

  revalidateIncidentPaths();
  return {
    success: true,
    message: `Incident Report ${inserted.case_number} logged as draft.`,
    data: { id: inserted.id, caseNumber: inserted.case_number },
  };
}

export async function issueNoticeToExplainAction(
  input: z.infer<typeof issueNteSchema>
): Promise<ActionResult<{ deadlineAt: string }>> {
  const hrCtx = await getHrSessionContext();
  if (!hrCtx || !canHr(hrCtx.hr_role, "ir:manage", hrCtx.is_tenant_owner)) {
    return {
      success: false,
      error: "Only HR Admin or HR Generalist can issue a Notice to Explain.",
    };
  }

  const parsed = issueNteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid NTE payload.",
    };
  }

  const admin = getAdminClient();
  const { data: report } = await admin
    .from("incident_reports")
    .select("*")
    .eq("id", parsed.data.caseId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Incident report not found." };
  }
  if (hrCtx.tenant_id && report.tenant_id !== hrCtx.tenant_id) {
    return { success: false, error: "Cross-tenant access denied." };
  }
  if (!canIssueNte(report.status as IncidentStatus)) {
    return {
      success: false,
      error: "Notice to Explain can only be issued for draft incident reports.",
    };
  }

  const issuedAt = new Date();
  const deadlineAt = computeNteDeadline(issuedAt);

  // Fetch tenant, employee, supervisor, and HR issuer details for formal PDF
  const [{ data: tenant }, { data: employee }, { data: issuerProfile }] =
    await Promise.all([
      admin
        .from("tenants")
        .select("name, address")
        .eq("id", report.tenant_id)
        .maybeSingle<{ name?: string | null; address?: string | null }>(),
      admin
        .from("employees")
        .select(
          "id, employee_number, job_title, profile_id, reports_to, department:departments!department_id(name), profile:profiles!profile_id(first_name, last_name)"
        )
        .eq("id", report.employee_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("first_name, last_name, hr_role")
        .eq("id", hrCtx.id)
        .maybeSingle<{
          first_name?: string | null;
          last_name?: string | null;
          hr_role?: string | null;
        }>(),
    ]);

  let supervisorName: string | null = null;
  if (employee?.reports_to) {
    const { data: sup } = await admin
      .from("employees")
      .select("profile:profiles!profile_id(first_name, last_name)")
      .eq("id", employee.reports_to)
      .maybeSingle();
    const supProf = Array.isArray(sup?.profile) ? sup?.profile[0] : sup?.profile;
    supervisorName =
      [supProf?.first_name, supProf?.last_name].filter(Boolean).join(" ") ||
      null;
  }

  const empProf = Array.isArray(employee?.profile)
    ? employee?.profile[0]
    : employee?.profile;
  const empDept = Array.isArray(employee?.department)
    ? employee?.department[0]
    : employee?.department;
  const employeeName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ") ||
    "Employee";
  const issuerName =
    [issuerProfile?.first_name, issuerProfile?.last_name]
      .filter(Boolean)
      .join(" ") || "HR Administration";

  const { pdfBytes, sha256 } = await generateNoticeToExplainPdf({
    tenantName: tenant?.name || "Company",
    tenantAddress: tenant?.address ?? null,
    caseNumber: report.case_number,
    issuedAt,
    deadlineAt,
    employeeName,
    employeeNumber: employee?.employee_number ?? null,
    employeePosition: employee?.job_title || "Staff",
    employeeDepartment: empDept?.name || "General",
    supervisorName,
    incidentDate: report.incident_date,
    offenseCategory: report.offense_category,
    policyViolated: report.policy_violated,
    description: report.description,
    issuedByName: issuerName,
    issuedByTitle:
      issuerProfile?.hr_role === "hr_generalist" ? "HR Generalist" : "HR Admin",
    hrSignaturePngBase64: parsed.data.hrSignatureDataUrl ?? null,
    hrSignatoryName: issuerName,
    hrSignedAt: issuedAt,
  });

  const pdfPath = `${report.tenant_id}/cases/${report.id}/NTE-${report.case_number}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(DISCIPLINARY_BUCKET)
    .upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Failed to store NTE PDF: ${uploadError.message}`,
    };
  }

  const { error: updateError } = await admin
    .from("incident_reports")
    .update({
      status: "nte_issued",
      nte_issued_at: issuedAt.toISOString(),
      nte_issued_by: hrCtx.id,
      nte_deadline_at: deadlineAt.toISOString(),
      nte_document_path: pdfPath,
      nte_hr_signature_name: issuerName,
      nte_hr_signed_at: issuedAt.toISOString(),
      nte_document_sha256: sha256,
    })
    .eq("id", report.id)
    .eq("status", "draft");

  if (updateError) {
    return {
      success: false,
      error: `Failed to update case status: ${updateError.message}`,
    };
  }

  if (employee?.profile_id) {
    await sendNotification({
      recipientId: employee.profile_id,
      senderId: hrCtx.id,
      type: "general",
      title: `Notice to Explain Issued (${report.case_number})`,
      body: `HR has issued a Notice to Explain regarding ${report.offense_category}. You have 5 calendar days to submit your written explanation.`,
      actionUrl: `/employee/notices?case=${report.id}`,
      actionName: "issueNoticeToExplainAction",
    });
  }

  revalidateIncidentPaths();
  return {
    success: true,
    message: `Notice to Explain issued for ${report.case_number}.`,
    data: { deadlineAt: deadlineAt.toISOString() },
  };
}

export async function submitEmployeeExplanationAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = explanationSchema.safeParse({
    caseId: String(formData.get("caseId") ?? ""),
    explanation: String(formData.get("explanation") ?? ""),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid explanation data.",
    };
  }

  const admin = getAdminClient();
  const { data: myEmployee } = await admin
    .from("employees")
    .select("id, tenant_id, profile:profiles!profile_id(first_name, last_name)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!myEmployee) {
    return { success: false, error: "Active employee record not found." };
  }

  const { data: report } = await admin
    .from("incident_reports")
    .select("id, tenant_id, case_number, employee_id, status")
    .eq("id", parsed.data.caseId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Case not found." };
  }
  if (report.employee_id !== myEmployee.id) {
    return {
      success: false,
      error: "You are not authorized to respond to this notice.",
    };
  }
  if (!canSubmitExplanation(report.status as IncidentStatus)) {
    return {
      success: false,
      error:
        "This notice is no longer accepting written explanations (already submitted or closed).",
    };
  }

  const rawFiles = formData
    .getAll("attachments")
    .filter((item): item is File => item instanceof File && item.size > 0);

  let attachmentPaths: string[] = [];
  if (rawFiles.length > 0) {
    const uploadRes = await uploadFilesToBucket(
      rawFiles,
      `${report.tenant_id}/cases/${report.id}/explanation`
    );
    if (uploadRes.error) {
      return { success: false, error: uploadRes.error };
    }
    attachmentPaths = uploadRes.paths;
  }

  const { error: updateError } = await admin
    .from("incident_reports")
    .update({
      employee_explanation: parsed.data.explanation,
      explanation_attachments: attachmentPaths,
      explanation_submitted_at: new Date().toISOString(),
      status: "explanation_submitted",
    })
    .eq("id", report.id)
    .eq("status", "nte_issued");

  if (updateError) {
    return {
      success: false,
      error: `Failed to submit explanation: ${updateError.message}`,
    };
  }

  const empProf = Array.isArray(myEmployee.profile)
    ? myEmployee.profile[0]
    : myEmployee.profile;
  const empName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ") ||
    "Employee";

  await notifyTenantHrAdmins({
    tenantId: report.tenant_id,
    senderId: user.id,
    title: `Written Explanation Submitted (${report.case_number})`,
    body: `${empName} submitted their written explanation for case ${report.case_number}. Ready for HR review & decision.`,
    actionUrl: `/hr/incidents?case=${report.id}`,
  });

  revalidateIncidentPaths();
  return {
    success: true,
    message: `Written explanation submitted for ${report.case_number}.`,
  };
}

export async function resolveIncidentReportAction(
  input: z.infer<typeof resolveIncidentSchema>
): Promise<ActionResult> {
  const hrCtx = await getHrSessionContext();
  if (!hrCtx || !canHr(hrCtx.hr_role, "ir:manage", hrCtx.is_tenant_owner)) {
    return {
      success: false,
      error: "Only HR Admin or HR Generalist can issue a final decision.",
    };
  }

  const parsed = resolveIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid decision payload.",
    };
  }

  const admin = getAdminClient();
  const { data: report } = await admin
    .from("incident_reports")
    .select("*")
    .eq("id", parsed.data.caseId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Incident report not found." };
  }
  if (hrCtx.tenant_id && report.tenant_id !== hrCtx.tenant_id) {
    return { success: false, error: "Cross-tenant access denied." };
  }

  const resolveCheck = canResolveCase(
    report.status as IncidentStatus,
    report.nte_deadline_at
  );
  if (!resolveCheck.allowed) {
    return {
      success: false,
      error: resolveCheck.reason ?? "Case cannot be resolved in its current state.",
    };
  }

  const resolvedAt = new Date();

  const [{ data: tenant }, { data: employee }, { data: resolverProfile }] =
    await Promise.all([
      admin
        .from("tenants")
        .select("name, address")
        .eq("id", report.tenant_id)
        .maybeSingle<{ name?: string | null; address?: string | null }>(),
      admin
        .from("employees")
        .select(
          "id, employee_number, job_title, profile_id, department:departments!department_id(name), profile:profiles!profile_id(first_name, last_name)"
        )
        .eq("id", report.employee_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("first_name, last_name, hr_role")
        .eq("id", hrCtx.id)
        .maybeSingle<{
          first_name?: string | null;
          last_name?: string | null;
          hr_role?: string | null;
        }>(),
    ]);

  const empProf = Array.isArray(employee?.profile)
    ? employee?.profile[0]
    : employee?.profile;
  const empDept = Array.isArray(employee?.department)
    ? employee?.department[0]
    : employee?.department;
  const employeeName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ") ||
    "Employee";
  const resolverName =
    [resolverProfile?.first_name, resolverProfile?.last_name]
      .filter(Boolean)
      .join(" ") || "HR Administration";

  const { pdfBytes, sha256 } = await generateNoticeOfDecisionPdf({
    tenantName: tenant?.name || "Company",
    tenantAddress: tenant?.address ?? null,
    caseNumber: report.case_number,
    resolvedAt,
    nteIssuedAt: report.nte_issued_at,
    nteAcknowledgedAt: report.nte_acknowledged_at,
    explanationSubmittedAt: report.explanation_submitted_at,
    lapsedWithoutResponse: resolveCheck.isLapsedWithoutResponse,
    employeeName,
    employeeNumber: employee?.employee_number ?? null,
    employeePosition: employee?.job_title || "Staff",
    employeeDepartment: empDept?.name || "General",
    incidentDate: report.incident_date,
    offenseCategory: report.offense_category,
    policyViolated: report.policy_violated,
    sanctionType: parsed.data.sanctionType as DisciplinarySanction,
    suspensionDays:
      parsed.data.sanctionType === "suspension"
        ? parsed.data.suspensionDays ?? null
        : null,
    suspensionStartDate:
      parsed.data.sanctionType === "suspension"
        ? parsed.data.suspensionStartDate ?? null
        : null,
    suspensionEndDate:
      parsed.data.sanctionType === "suspension"
        ? parsed.data.suspensionEndDate ?? null
        : null,
    resolutionNotes: parsed.data.resolutionNotes,
    resolvedByName: resolverName,
    resolvedByTitle:
      resolverProfile?.hr_role === "hr_generalist" ? "HR Generalist" : "HR Admin",
    hrSignaturePngBase64: parsed.data.hrSignatureDataUrl ?? null,
    hrSignatoryName: resolverName,
    hrSignedAt: resolvedAt,
  });

  const decisionPdfPath = `${report.tenant_id}/cases/${report.id}/Decision-${report.case_number}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(DISCIPLINARY_BUCKET)
    .upload(decisionPdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Failed to store Notice of Decision PDF: ${uploadError.message}`,
    };
  }

  const { error: updateError } = await admin
    .from("incident_reports")
    .update({
      status: parsed.data.outcome,
      sanction_type: parsed.data.sanctionType,
      suspension_days:
        parsed.data.sanctionType === "suspension"
          ? parsed.data.suspensionDays ?? null
          : null,
      suspension_start_date:
        parsed.data.sanctionType === "suspension"
          ? parsed.data.suspensionStartDate ?? null
          : null,
      suspension_end_date:
        parsed.data.sanctionType === "suspension"
          ? parsed.data.suspensionEndDate ?? null
          : null,
      resolution_notes: parsed.data.resolutionNotes,
      decision_document_path: decisionPdfPath,
      resolved_at: resolvedAt.toISOString(),
      resolved_by: hrCtx.id,
      decision_hr_signature_name: resolverName,
      decision_hr_signed_at: resolvedAt.toISOString(),
      decision_document_sha256: sha256,
    })
    .eq("id", report.id);

  if (updateError) {
    return {
      success: false,
      error: `Failed to save final decision: ${updateError.message}`,
    };
  }

  if (employee?.profile_id) {
    await sendNotification({
      recipientId: employee.profile_id,
      senderId: hrCtx.id,
      type: "general",
      title: `Notice of Decision Issued (${report.case_number})`,
      body: `HR has issued a final Notice of Decision for case ${report.case_number}. View the decision document in your notices.`,
      actionUrl: `/employee/notices?case=${report.id}`,
      actionName: "resolveIncidentReportAction",
    });
  }

  revalidateIncidentPaths();
  return {
    success: true,
    message: `Final Notice of Decision issued for ${report.case_number}.`,
  };
}

export async function getDisciplinaryDocumentUrlAction(
  input: z.infer<typeof signedUrlSchema>
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = signedUrlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid document request.",
    };
  }

  const admin = getAdminClient();
  const { data: report } = await admin
    .from("incident_reports")
    .select(
      "id, tenant_id, employee_id, reported_by, status, evidence_paths, explanation_attachments, nte_document_path, decision_document_path"
    )
    .eq("id", parsed.data.caseId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Case not found." };
  }

  const allowedPaths = new Set<string>([
    ...(report.evidence_paths ?? []),
    ...(report.explanation_attachments ?? []),
    ...(report.nte_document_path ? [report.nte_document_path] : []),
    ...(report.decision_document_path ? [report.decision_document_path] : []),
  ]);

  if (!allowedPaths.has(parsed.data.filePath)) {
    return { success: false, error: "Document does not belong to this case." };
  }

  const hrCtx = await getHrSessionContext();
  const isAuthorizedHr =
    Boolean(hrCtx) &&
    canHr(hrCtx?.hr_role, "ir:manage", hrCtx?.is_tenant_owner) &&
    (!hrCtx?.tenant_id || hrCtx.tenant_id === report.tenant_id);

  let isAuthorized = isAuthorizedHr || report.reported_by === user.id;

  if (!isAuthorized && report.status !== "draft") {
    const { data: myEmployee } = await admin
      .from("employees")
      .select("id")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (myEmployee && myEmployee.id === report.employee_id) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return {
      success: false,
      error: "You do not have permission to access this disciplinary document.",
    };
  }

  const { data: signed, error: signError } = await admin.storage
    .from(DISCIPLINARY_BUCKET)
    .createSignedUrl(parsed.data.filePath, 120);

  if (signError || !signed?.signedUrl) {
    return {
      success: false,
      error: signError?.message ?? "Failed to generate signed document URL.",
    };
  }

  return {
    success: true,
    data: { url: signed.signedUrl },
  };
}

export async function acknowledgeDisciplinaryNoticeAction(
  input: z.infer<typeof acknowledgeNoticeSchema>
): Promise<ActionResult<{ acknowledgedAt: string; sha256: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = acknowledgeNoticeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid acknowledgment request.",
    };
  }

  const admin = getAdminClient();
  const { data: myEmployee } = await admin
    .from("employees")
    .select(
      "id, tenant_id, profile:profiles!profile_id(first_name, last_name)"
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!myEmployee) {
    return { success: false, error: "Active employee record not found." };
  }

  const { data: report } = await admin
    .from("incident_reports")
    .select(
      "id, tenant_id, case_number, employee_id, status, nte_issued_at, nte_document_path, nte_acknowledged_at, decision_document_path, decision_acknowledged_at"
    )
    .eq("id", parsed.data.incidentId)
    .maybeSingle();

  if (!report) {
    return { success: false, error: "Disciplinary notice not found." };
  }

  if (report.employee_id !== myEmployee.id) {
    return {
      success: false,
      error: "You are not authorized to acknowledge this disciplinary notice.",
    };
  }

  const isNte = parsed.data.noticeType === "nte";
  const docPath = isNte
    ? report.nte_document_path
    : report.decision_document_path;

  if (isNte) {
    if (!report.nte_issued_at || !docPath) {
      return {
        success: false,
        error: "Notice to Explain has not been issued yet.",
      };
    }
    if (report.nte_acknowledged_at) {
      return {
        success: false,
        error: "Notice to Explain receipt has already been acknowledged.",
      };
    }
  } else {
    if (
      (report.status !== "resolved" && report.status !== "dismissed") ||
      !docPath
    ) {
      return {
        success: false,
        error: "Notice of Decision has not been issued yet.",
      };
    }
    if (report.decision_acknowledged_at) {
      return {
        success: false,
        error: "Notice of Decision receipt has already been acknowledged.",
      };
    }
  }

  const { data: downloaded, error: downloadError } = await admin.storage
    .from(DISCIPLINARY_BUCKET)
    .download(docPath);

  if (downloadError || !downloaded) {
    return {
      success: false,
      error:
        downloadError?.message ??
        "Failed to retrieve stored PDF for stamping.",
    };
  }

  const existingPdfBytes = new Uint8Array(await downloaded.arrayBuffer());
  const empProf = Array.isArray(myEmployee.profile)
    ? myEmployee.profile[0]
    : myEmployee.profile;
  const empName =
    [empProf?.first_name, empProf?.last_name].filter(Boolean).join(" ") ||
    "Employee";

  const acknowledgedAt = new Date();
  const { pdfBytes, sha256 } = await stampEmployeeAcknowledgmentOnPdf({
    existingPdfBytes,
    employeeSignaturePngBase64: parsed.data.signatureDataUrl,
    employeeName: empName,
    acknowledgedAt,
    caseNumber: report.case_number,
    noticeType: parsed.data.noticeType,
  });

  const { error: uploadError } = await admin.storage
    .from(DISCIPLINARY_BUCKET)
    .upload(docPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Failed to save stamped PDF: ${uploadError.message}`,
    };
  }

  const reqHeaders = await headers();
  const forwardedFor = reqHeaders.get("x-forwarded-for");
  const clientIp =
    forwardedFor?.split(",")[0]?.trim() ||
    reqHeaders.get("x-real-ip") ||
    null;

  const updatePayload = isNte
    ? {
        nte_acknowledged_at: acknowledgedAt.toISOString(),
        nte_acknowledgment_ip: clientIp,
        nte_document_sha256: sha256,
      }
    : {
        decision_acknowledged_at: acknowledgedAt.toISOString(),
        decision_acknowledgment_ip: clientIp,
        decision_document_sha256: sha256,
      };

  const { error: updateError } = await admin
    .from("incident_reports")
    .update(updatePayload)
    .eq("id", report.id);

  if (updateError) {
    return {
      success: false,
      error: `Failed to record acknowledgment: ${updateError.message}`,
    };
  }

  const noticeLabel = isNte ? "Notice to Explain" : "Notice of Decision";
  await notifyTenantHrAdmins({
    tenantId: report.tenant_id,
    senderId: user.id,
    title: `${noticeLabel} Acknowledged (${report.case_number})`,
    body: `${empName} digitally acknowledged receipt of the ${noticeLabel} for case ${report.case_number}.`,
    actionUrl: `/hr/incidents?case=${report.id}`,
  });

  revalidateIncidentPaths();
  return {
    success: true,
    message: `${noticeLabel} receipt acknowledged and stamped on PDF.`,
    data: {
      acknowledgedAt: acknowledgedAt.toISOString(),
      sha256,
    },
  };
}

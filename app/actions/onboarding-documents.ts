"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type {
  EmployeeOnboardingProgress,
  OnboardingDocumentRequirement,
  EmployeeOnboardingDocument,
  OnboardingDocumentItem,
  OnboardingDocumentStatus,
} from "@/lib/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
];

/**
 * Returns the list of document requirements joined with submitted document records,
 * overall completion percentage, and itemized status counts.
 */
export async function getEmployeeOnboardingProgress(
  employeeId?: string
): Promise<ActionResult<EmployeeOnboardingProgress>> {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  let targetEmployee: any = null;

  if (employeeId) {
    const { data: emp } = await admin
      .from("employees")
      .select("*, profiles ( first_name, last_name, email )")
      .eq("id", employeeId)
      .maybeSingle();
    targetEmployee = emp;
  } else {
    // Resolve logged in user's employee record
    const { data: emp } = await admin
      .from("employees")
      .select("*, profiles ( first_name, last_name, email )")
      .eq("profile_id", user.id)
      .maybeSingle();
    targetEmployee = emp;
  }

  if (!targetEmployee) {
    return { success: false, error: "Employee record not found" };
  }

  const tenantId = targetEmployee.tenant_id || DEFAULT_TENANT_ID;

  // 1. Fetch document requirements for this tenant (or default tenant fallback)
  let { data: requirements } = await admin
    .from("onboarding_document_requirements")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (!requirements || requirements.length === 0) {
    const { data: defaultReqs } = await admin
      .from("onboarding_document_requirements")
      .select("*")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .order("created_at", { ascending: true });

    requirements = defaultReqs || [];
  }

  // 2. Fetch submitted onboarding documents for this employee
  const { data: submittedDocs } = await admin
    .from("employee_onboarding_documents")
    .select("*")
    .eq("employee_id", targetEmployee.id);

  const docsMap = new Map<string, EmployeeOnboardingDocument>();
  if (submittedDocs) {
    for (const doc of submittedDocs) {
      docsMap.set(doc.requirement_id, doc as EmployeeOnboardingDocument);
    }
  }

  const items: OnboardingDocumentItem[] = (requirements || []).map((req) => {
    const doc = docsMap.get(req.id) || null;
    const status: OnboardingDocumentStatus = doc
      ? (doc.status as OnboardingDocumentStatus)
      : "pending";

    return {
      requirement: req as OnboardingDocumentRequirement,
      document: doc,
      status,
    };
  });

  const counts = {
    pending: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  };

  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }

  const totalRequirements = items.length;
  const approvedCount = counts.approved;
  const completionPercentage =
    totalRequirements > 0
      ? Math.round((approvedCount / totalRequirements) * 100)
      : 0;

  return {
    success: true,
    data: {
      items,
      completionPercentage,
      totalRequirements,
      approvedCount,
      counts,
      employee: targetEmployee,
    },
  };
}

/**
 * Validates file size (Max 5 MB) & MIME type, uploads to Supabase Storage bucket `employee-documents`,
 * inserts/updates `employee_onboarding_documents` setting status = 'submitted',
 * and revalidates relevant portal paths.
 */
export async function uploadOnboardingDocument(
  formData: FormData
): Promise<ActionResult<EmployeeOnboardingDocument>> {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const requirementId = formData.get("requirement_id") as string;
  const requirementCode = (formData.get("requirement_code") as string) || "doc";
  const explicitEmployeeId = formData.get("employee_id") as string | null;
  const file = formData.get("file") as File | null;

  if (!file) {
    return { success: false, error: "No file uploaded" };
  }

  if (!requirementId) {
    return { success: false, error: "Requirement ID is required" };
  }

  // 1. File size validation (Max 5 MB)
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "File size exceeds maximum limit of 5 MB" };
  }

  // 2. MIME type validation (application/pdf, image/jpeg, image/png)
  const fileMime = file.type?.toLowerCase();
  if (!fileMime || !ALLOWED_MIME_TYPES.includes(fileMime)) {
    return {
      success: false,
      error: "Invalid file type. Only PDF, JPEG, and PNG files are allowed.",
    };
  }

  // 3. Resolve target employee
  let targetEmployee: any = null;
  if (explicitEmployeeId) {
    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id, profile_id")
      .eq("id", explicitEmployeeId)
      .maybeSingle();
    targetEmployee = emp;
  } else {
    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id, profile_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    targetEmployee = emp;
  }

  if (!targetEmployee) {
    return { success: false, error: "Employee record not found" };
  }

  const tenantId = targetEmployee.tenant_id || DEFAULT_TENANT_ID;
  const employeeId = targetEmployee.id;

  // Derive file extension
  let ext = "pdf";
  if (fileMime.includes("png")) ext = "png";
  else if (fileMime.includes("jpeg") || fileMime.includes("jpg")) ext = "jpg";
  else if (file.name.includes(".")) ext = file.name.split(".").pop() || "pdf";

  const sanitizedCode = requirementCode.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const timestamp = Date.now();
  const filePath = `${tenantId}/${employeeId}/${sanitizedCode}_${timestamp}.${ext}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to employee-documents bucket
    const { error: uploadErr } = await admin.storage
      .from("employee-documents")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return {
        success: false,
        error: `Failed to upload file to storage: ${uploadErr.message}`,
      };
    }

    // Upsert database record in employee_onboarding_documents
    const docPayload = {
      tenant_id: tenantId,
      employee_id: employeeId,
      requirement_id: requirementId,
      file_path: filePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      status: "submitted",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedDoc, error: dbErr } = await admin
      .from("employee_onboarding_documents")
      .upsert(docPayload, { onConflict: "employee_id, requirement_id" })
      .select("*")
      .single();

    if (dbErr) {
      console.error("DB upsert error:", dbErr);
      return {
        success: false,
        error: `Failed to record document metadata: ${dbErr.message}`,
      };
    }

    revalidatePath("/employee/onboarding");
    revalidatePath(`/hr/employees/${employeeId}`);

    return {
      success: true,
      message: "Document uploaded successfully",
      data: insertedDoc as EmployeeOnboardingDocument,
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unknown error occurred during document upload",
    };
  }
}

/**
 * HR-only action to approve or reject a submitted document with an optional rejection reason.
 */
export async function reviewOnboardingDocument(
  documentId: string,
  status: "approved" | "rejected",
  reason?: string
): Promise<ActionResult<EmployeeOnboardingDocument>> {
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Check HR role
  const { data: hrProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isHR = hrProfile?.role === "hr_manager" || hrProfile?.role === "admin";
  if (!isHR) {
    return {
      success: false,
      error: "Forbidden: Only HR personnel can review onboarding documents",
    };
  }

  try {
    const reviewData = {
      status,
      rejection_reason: status === "rejected" ? reason || "Document rejected by HR" : null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedDoc, error: updateErr } = await admin
      .from("employee_onboarding_documents")
      .update(reviewData)
      .eq("id", documentId)
      .select("*")
      .single();

    if (updateErr || !updatedDoc) {
      return {
        success: false,
        error: `Failed to update document status: ${updateErr?.message || "Document not found"}`,
      };
    }

    revalidatePath("/employee/onboarding");
    revalidatePath(`/hr/employees/${updatedDoc.employee_id}`);

    return {
      success: true,
      message: `Document successfully ${status}`,
      data: updatedDoc as EmployeeOnboardingDocument,
    };
  } catch (error) {
    console.error("Review error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to review onboarding document",
    };
  }
}

/**
 * Generates a short-lived Supabase Storage signed URL (15-minute expiry) for safe document viewing.
 */
export async function getSignedDocumentUrl(
  filePath: string
): Promise<ActionResult<string>> {
  const admin = getAdminClient();

  if (!filePath) {
    return { success: false, error: "File path is required" };
  }

  try {
    // 15-minute expiry = 900 seconds
    const { data, error } = await admin.storage
      .from("employee-documents")
      .createSignedUrl(filePath, 900);

    if (error || !data?.signedUrl) {
      return {
        success: false,
        error: `Failed to generate preview URL: ${error?.message || "Invalid path"}`,
      };
    }

    return {
      success: true,
      data: data.signedUrl,
    };
  } catch (error) {
    console.error("Signed URL error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate signed URL",
    };
  }
}

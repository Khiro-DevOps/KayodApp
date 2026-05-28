"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { sendNotification } from "@/lib/notifications";

export type RequiredDocumentDraft = {
  id?: string;
  name: string;
  is_required: boolean;
};

function parseRequiredDocuments(value: FormDataEntryValue | null): RequiredDocumentDraft[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value)) as RequiredDocumentDraft[];
    return Array.isArray(parsed)
      ? parsed
          .map((document) => ({
            id: typeof document.id === "string" ? document.id : undefined,
            name: String(document.name ?? "").trim(),
            is_required: Boolean(document.is_required),
          }))
          .filter((document) => document.name.length > 0)
      : [];
  } catch {
    return [];
  }
}

async function verifyHRForJob(jobPostingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (!isHRRole(effectiveRole(profile?.role, (user.user_metadata?.role as string | undefined) ?? null))) {
    return { ok: false as const, error: "Forbidden" };
  }

  const admin = getAdminClient();
  const { data: jobPosting, error } = await admin
    .from("job_postings")
    .select("id, created_by, title")
    .eq("id", jobPostingId)
    .maybeSingle<{ id: string; created_by: string; title: string }>();

  if (error || !jobPosting) {
    return { ok: false as const, error: "Job posting not found" };
  }

  if (jobPosting.created_by !== user.id) {
    return { ok: false as const, error: "Forbidden" };
  }

  return { ok: true as const, userId: user.id, jobPosting };
}

async function syncJobDocuments(jobPostingId: string, documents: RequiredDocumentDraft[]) {
  const admin = getAdminClient();

  await admin.from("job_required_documents").delete().eq("job_posting_id", jobPostingId);

  if (documents.length === 0) {
    return;
  }

  await admin.from("job_required_documents").insert(
    documents.map((document) => ({
      job_posting_id: jobPostingId,
      name: document.name,
      is_required: document.is_required,
    }))
  );
}

export async function saveJobRequiredDocuments(jobPostingId: string, value: FormDataEntryValue | null) {
  const documents = parseRequiredDocuments(value);
  await syncJobDocuments(jobPostingId, documents);
}

export async function moveApplicantToPreEmployment(formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "").trim();
  const jobPostingId = String(formData.get("job_posting_id") ?? formData.get("job_id") ?? "").trim();
  const docDeadline = String(formData.get("doc_deadline") ?? "").trim() || null;
  const docSubmissionNote = String(formData.get("doc_submission_note") ?? "").trim() || null;
  const documents = parseRequiredDocuments(formData.get("documents_json"));

  if (!applicationId || !jobPostingId) {
    return { success: false, error: "Missing required fields" };
  }

  const authCheck = await verifyHRForJob(jobPostingId);
  if (!authCheck.ok) {
    return { success: false, error: authCheck.error };
  }

  const admin = getAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select("id, candidate_id, job_posting_id, status, profiles(first_name, last_name, email), job_postings(title)")
    .eq("id", applicationId)
    .maybeSingle<{ id: string; candidate_id: string; job_posting_id: string; status: string; profiles?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null; job_postings?: { title?: string | null } | null }>();

  if (applicationError || !application) {
    return { success: false, error: "Application not found" };
  }

  if (application.job_posting_id !== jobPostingId) {
    return { success: false, error: "Application does not belong to the selected job" };
  }

  const finalDocuments = documents.length > 0
    ? documents
    : (await admin
        .from("job_required_documents")
        .select("id, name, is_required")
        .eq("job_posting_id", jobPostingId)
        .order("created_at", { ascending: true })
      ).data?.map((document) => ({
        id: document.id,
        name: document.name,
        is_required: document.is_required,
      })) ?? [];

  const now = new Date().toISOString();

  const [{ error: updateError }, { error: deleteError }, { error: insertError }] = await Promise.all([
    admin
      .from("applications")
      .update({
        status: "pre_employment",
        doc_deadline: docDeadline,
        doc_submission_note: docSubmissionNote,
        updated_at: now,
      })
      .eq("id", applicationId),
    admin.from("applicant_documents").delete().eq("application_id", applicationId),
    finalDocuments.length > 0
      ? admin.from("applicant_documents").insert(
          finalDocuments.map((document) => ({
            application_id: applicationId,
            applicant_id: application.candidate_id,
            document_id: document.id,
            file_url: null,
            submission_type: null,
            submitted_at: null,
            hr_verified: false,
            hr_verified_at: null,
            hr_verified_by: null,
            notes: null,
          }))
        )
      : Promise.resolve({ error: null }),
  ]);

  if (updateError || deleteError || insertError) {
    return {
      success: false,
      error: updateError?.message || deleteError?.message || insertError?.message || "Failed to move applicant to pre-employment",
    };
  }

  await sendNotification({
    supabase: admin,
    recipientId: application.candidate_id,
    type: "application_status_changed",
    title: "Pre-employment requirements ready",
    body: "Please submit your pre-employment documents to continue your application.",
    actionUrl: `/apply/applications/${applicationId}/documents`,
  });

  revalidatePath(`/jobs/manage/${jobPostingId}/applicants`);
  revalidatePath(`/jobs/manage/${jobPostingId}/applicants/${applicationId}/documents`);
  revalidatePath(`/apply/applications/${applicationId}/documents`);

  return {
    success: true,
    applicantName: [application.profiles?.first_name, application.profiles?.last_name].filter(Boolean).join(" ") || "Applicant",
  };
}

export async function reviewApplicantDocument(formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "").trim();
  const documentId = String(formData.get("document_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!applicationId || !documentId || !action) {
    return { success: false, error: "Missing required fields" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const admin = getAdminClient();
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    updated_at: now,
    notes: note,
  };

  if (action === "approve") {
    updatePayload.hr_verified = true;
    updatePayload.hr_verified_at = now;
    updatePayload.hr_verified_by = user.id;
    updatePayload.submission_type = "digital";
  } else if (action === "request_resubmission") {
    updatePayload.hr_verified = false;
    updatePayload.hr_verified_at = null;
    updatePayload.hr_verified_by = null;
  } else if (action === "mark_received_in_person") {
    updatePayload.hr_verified = true;
    updatePayload.hr_verified_at = now;
    updatePayload.hr_verified_by = user.id;
    updatePayload.submission_type = "in_person";
  } else {
    return { success: false, error: "Invalid action" };
  }

  const { error } = await admin
    .from("applicant_documents")
    .update(updatePayload)
    .eq("application_id", applicationId)
    .eq("document_id", documentId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/jobs/manage`);
  revalidatePath(`/jobs/manage/${applicationId}/documents`);
  revalidatePath(`/apply/applications/${applicationId}/documents`);

  return { success: true };
}

export async function submitApplicantDocument(formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "").trim();
  const documentId = String(formData.get("document_id") ?? "").trim();
  const file = formData.get("file");

  if (!applicationId || !documentId || !(file instanceof File)) {
    return { success: false, error: "Missing required fields" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const admin = getAdminClient();
  const { data: application } = await admin
    .from("applications")
    .select("id, candidate_id, status, job_posting_id")
    .eq("id", applicationId)
    .maybeSingle<{ id: string; candidate_id: string; status: string; job_posting_id: string }>();

  if (!application || application.candidate_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  const normalizedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
  if (!allowedTypes.has(file.type)) {
    return { success: false, error: "File must be a PDF, JPG, or PNG" };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File must be 10MB or smaller" };
  }

  const bucketName = "pre-employment-docs";
  const storagePath = `${applicationId}/${documentId}/${Date.now()}-${normalizedName}`;
  const uploadBody = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(bucketName)
    .upload(storagePath, uploadBody, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data: publicUrlData } = admin.storage.from(bucketName).getPublicUrl(storagePath);

  const now = new Date().toISOString();
  const { error } = await admin
    .from("applicant_documents")
    .upsert(
      {
        application_id: applicationId,
        applicant_id: application.candidate_id,
        document_id: documentId,
        file_url: publicUrlData.publicUrl,
        submission_type: "digital",
        submitted_at: now,
        hr_verified: false,
        hr_verified_at: null,
        hr_verified_by: null,
        notes: null,
        updated_at: now,
      },
      { onConflict: "application_id,document_id" }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/apply/applications/${applicationId}/documents`);
  revalidatePath(`/jobs/manage/${application.job_posting_id}/applicants/${applicationId}/documents`);

  return { success: true, fileUrl: publicUrlData.publicUrl };
}

export async function markDocumentForInPersonSubmission(formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "").trim();
  const documentId = String(formData.get("document_id") ?? "").trim();

  if (!applicationId || !documentId) {
    return { success: false, error: "Missing required fields" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const admin = getAdminClient();
  const { data: application } = await admin
    .from("applications")
    .select("id, candidate_id, job_posting_id")
    .eq("id", applicationId)
    .maybeSingle<{ id: string; candidate_id: string; job_posting_id: string }>();

  if (!application || application.candidate_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("applicant_documents")
    .upsert(
      {
        application_id: applicationId,
        applicant_id: user.id,
        document_id: documentId,
        file_url: null,
        submission_type: "in_person",
        submitted_at: null,
        hr_verified: false,
        hr_verified_at: null,
        hr_verified_by: null,
        notes: null,
        updated_at: now,
      },
      { onConflict: "application_id,document_id" }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/apply/applications/${applicationId}/documents`);
  revalidatePath(`/jobs/manage/${application.job_posting_id}/applicants/${applicationId}/documents`);

  return { success: true };
}

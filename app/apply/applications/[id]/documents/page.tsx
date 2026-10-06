
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ApplicantDocument, JobRequiredDocument } from "@/lib/types";
import ApplicantDocumentsClient from "./documents-client";

type ApplicantDocumentsPageRow = {
  id: string;
  candidate_id: string;
  status: string;
  doc_deadline: string | null;
  doc_submission_note: string | null;
  job_postings: {
    id: string;
    title: string;
  } | null;
};

export default async function ApplicantDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: applicationId } = await params;
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: application } = await admin
    .from("applications")
    .select(`
      id,
      candidate_id,
      status,
      doc_deadline,
      doc_submission_note,
      job_postings ( id, title )
    `)
    .eq("id", applicationId)
    .eq("candidate_id", user.id)
    .maybeSingle<ApplicantDocumentsPageRow>();

  let resolvedApplication = application;
  if (!resolvedApplication) {
    const { data: jobApplication } = await admin
      .from("job_applications")
      .select("id, job_id, applicant_id")
      .eq("id", applicationId)
      .eq("applicant_id", user.id)
      .maybeSingle();
    if (jobApplication) {
      const { data: legacyApplication } = await admin
        .from("applications")
        .select("id, candidate_id, status, doc_deadline, doc_submission_note, job_postings ( id, title )")
        .eq("job_posting_id", jobApplication.job_id)
        .eq("candidate_id", jobApplication.applicant_id)
        .maybeSingle<ApplicantDocumentsPageRow>();
      resolvedApplication = legacyApplication;
    }
  }

  if (!resolvedApplication || resolvedApplication.status !== "pre_employment") {
    redirect("/dashboard");
  }

  const { data: requiredDocuments } = await admin
    .from("job_required_documents")
    .select("id, job_posting_id, name, is_required, created_at, updated_at")
    .eq("job_posting_id", resolvedApplication.job_postings?.id ?? "")
    .order("created_at", { ascending: true })
    .returns<JobRequiredDocument[]>();

  const { data: applicantDocuments } = await admin
    .from("applicant_documents")
    .select(`
      id,
      application_id,
      applicant_id,
      document_id,
      file_url,
      submission_type,
      submitted_at,
      hr_verified,
      hr_verified_at,
      hr_verified_by,
      notes,
      created_at,
      updated_at
    `)
    .eq("application_id", resolvedApplication.id)
    .returns<ApplicantDocument[]>();

  const documentRows = (requiredDocuments ?? []).map((requiredDocument) => ({
    requiredDocument,
    applicantDocument: (applicantDocuments ?? []).find((document) => document.document_id === requiredDocument.id) ?? null,
  }));

  const verifiedCount = documentRows.filter(({ requiredDocument, applicantDocument }) => requiredDocument.is_required && applicantDocument?.hr_verified).length;
  const totalRequired = documentRows.filter(({ requiredDocument }) => requiredDocument.is_required).length;
  const deadlineDate = resolvedApplication.doc_deadline ? new Date(resolvedApplication.doc_deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <ApplicantDocumentsClient
      applicationId={resolvedApplication.id}
      jobTitle={resolvedApplication.job_postings?.title ?? "Pre-employment requirements"}
      deadline={resolvedApplication.doc_deadline}
      daysLeft={daysLeft}
      submissionNote={resolvedApplication.doc_submission_note}
      verifiedCount={verifiedCount}
      totalRequired={totalRequired}
      documents={documentRows}
    />
  );
}

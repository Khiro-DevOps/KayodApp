import Link from "next/link";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import HireConfirmationModal from "@/components/hr/HireConfirmationModal";
import JobRequiredDocumentsEditor from "@/components/job-required-documents-editor";
import type { ApplicantDocument, JobRequiredDocument, Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { moveApplicantToPreEmployment, reviewApplicantDocument } from "@/lib/pre-employment-actions";

type JobPostingRow = {
  id: string;
  title: string;
};

type ApplicantRow = {
  id: string;
  candidate_id: string;
  job_posting_id: string;
  status: string;
  doc_deadline: string | null;
  doc_submission_note: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  job_postings: JobPostingRow | null;
};

export default async function ApplicantDocumentsPage({
  params,
}: {
  params: Promise<{ id: string; appId: string }>;
}) {
  const { id: jobId, appId } = await params;
  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const authRole = (user.user_metadata?.role as string | undefined) ?? null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  const { data: jobPosting } = await admin
    .from("job_postings")
    .select("id, title, created_by")
    .eq("id", jobId)
    .maybeSingle<JobPostingRow & { created_by: string }>();

  if (!jobPosting || jobPosting.created_by !== user.id) {
    redirect("/jobs/manage");
  }

  const { data: application } = await admin
    .from("applications")
    .select(`
      id,
      candidate_id,
      job_posting_id,
      status,
      doc_deadline,
      doc_submission_note,
      profiles ( first_name, last_name, email ),
      job_postings ( id, title )
    `)
    .eq("id", appId)
    .eq("job_posting_id", jobId)
    .maybeSingle<ApplicantRow>();

  if (!application) {
    redirect(`/jobs/manage/${jobId}/applicants`);
  }

  const { data: requiredDocuments } = await admin
    .from("job_required_documents")
    .select("id, job_posting_id, name, is_required, created_at, updated_at")
    .eq("job_posting_id", jobId)
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
      updated_at,
      document:job_required_documents (
        id,
        job_posting_id,
        name,
        is_required,
        created_at,
        updated_at
      )
    `)
    .eq("application_id", appId)
    .returns<ApplicantDocument[]>();

  const documentRows = (requiredDocuments ?? []).map((requiredDocument) => ({
    requiredDocument,
    applicantDocument: (applicantDocuments ?? []).find((document) => document.document_id === requiredDocument.id) ?? null,
  }));

  const verifiedCount = documentRows.filter(({ requiredDocument, applicantDocument }) => requiredDocument.is_required && applicantDocument?.hr_verified).length;
  const totalRequired = documentRows.filter(({ requiredDocument }) => requiredDocument.is_required).length;
  const deadlineDate = application.doc_deadline ? new Date(application.doc_deadline) : null;
  const isOverdue = deadlineDate ? deadlineDate.getTime() < Date.now() : false;
  const allRequiredVerified = totalRequired === 0 || verifiedCount === totalRequired;
  const candidateName = [application.profiles?.first_name, application.profiles?.last_name].filter(Boolean).join(" ") || "Applicant";
  const jobTitle = application.job_postings?.title ?? jobPosting.title;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${jobId}/applicants`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              Pre-employment documents
            </h1>
            <p className="text-xs text-text-secondary truncate">{candidateName} · {jobTitle}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-secondary">Progress</p>
              <p className="text-lg font-semibold text-text-primary">{verifiedCount} / {totalRequired} verified</p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${isOverdue ? "bg-red-50 text-red-700" : "bg-gray-100 text-text-secondary"}`}>
              {deadlineDate ? `Deadline ${deadlineDate.toLocaleDateString()}` : "No deadline set"}
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${totalRequired === 0 ? 100 : (verifiedCount / totalRequired) * 100}%` }}
            />
          </div>

          {isOverdue && !allRequiredVerified && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Deadline passed. Some documents are still incomplete.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Set up pre-employment</p>
            <p className="text-xs text-text-secondary">Set the deadline, instruction note, and required checklist for this applicant.</p>
          </div>

          <form action={moveApplicantToPreEmployment} className="space-y-4">
            <input type="hidden" name="application_id" value={application.id} />
            <input type="hidden" name="job_posting_id" value={jobId} />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="doc_deadline" className="text-sm font-medium text-text-primary">Submission deadline</label>
                <input
                  id="doc_deadline"
                  name="doc_deadline"
                  type="datetime-local"
                  defaultValue={deadlineDate ? deadlineDate.toISOString().slice(0, 16) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1 md:col-span-1">
                <label htmlFor="doc_submission_note" className="text-sm font-medium text-text-primary">Instruction note</label>
                <textarea
                  id="doc_submission_note"
                  name="doc_submission_note"
                  rows={3}
                  defaultValue={application.doc_submission_note ?? ""}
                  placeholder="Optional instructions for the applicant"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            </div>

            <JobRequiredDocumentsEditor
              name="documents_json"
              initialDocuments={(requiredDocuments ?? []).map((document) => ({
                id: document.id,
                name: document.name,
                is_required: document.is_required,
              }))}
            />

            <button
              type="submit"
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              {application.status === "pre_employment" ? "Update pre-employment setup" : "Move to Pre-employment"}
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Document checklist</h2>
          <div className="space-y-3">
            {documentRows.map(({ requiredDocument, applicantDocument }) => {
              const verified = Boolean(applicantDocument?.hr_verified);
              const submissionType = applicantDocument?.submission_type ?? null;
              const statusLabel = verified
                ? "Verified"
                : applicantDocument?.notes
                  ? "Resubmission needed"
                  : applicantDocument?.file_url
                    ? "Submitted"
                    : "Pending";

              return (
                <article key={requiredDocument.id} className="rounded-2xl border border-border bg-white p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{requiredDocument.name}</p>
                      <p className="text-xs text-text-secondary">{requiredDocument.is_required ? "Required" : "Optional"}</p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-medium ${verified ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {statusLabel}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-text-secondary">
                      {submissionType === "digital" ? "Digital" : submissionType === "in_person" ? "In Person" : "Pending"}
                    </span>
                    {verified && applicantDocument?.hr_verified_at && (
                      <span className="text-green-700">Verified {new Date(applicantDocument.hr_verified_at).toLocaleString()}</span>
                    )}
                  </div>

                  {applicantDocument?.file_url && (
                    <a
                      href={applicantDocument.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
                    >
                      Open file
                    </a>
                  )}

                  {!verified && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <form action={reviewApplicantDocument} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="application_id" value={application.id} />
                        <input type="hidden" name="document_id" value={requiredDocument.id} />
                        <input type="hidden" name="action" value="approve" />
                        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark">
                          Approve
                        </button>
                      </form>

                      <form action={reviewApplicantDocument} className="flex flex-1 flex-wrap items-center gap-2">
                        <input type="hidden" name="application_id" value={application.id} />
                        <input type="hidden" name="document_id" value={requiredDocument.id} />
                        <input type="hidden" name="action" value="request_resubmission" />
                        <input
                          name="note"
                          defaultValue={applicantDocument?.notes ?? ""}
                          placeholder="Resubmission note"
                          className="min-w-[220px] flex-1 rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <button type="submit" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                          Request resubmission
                        </button>
                      </form>

                      <form action={reviewApplicantDocument}>
                        <input type="hidden" name="application_id" value={application.id} />
                        <input type="hidden" name="document_id" value={requiredDocument.id} />
                        <input type="hidden" name="action" value="mark_received_in_person" />
                        <button type="submit" className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-primary hover:bg-gray-50">
                          Mark as received in person
                        </button>
                      </form>
                    </div>
                  )}

                  {verified && applicantDocument?.notes && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                      {applicantDocument.notes}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
          <div>
            <p className="text-sm font-semibold text-text-primary">Confirm hire</p>
            <p className="text-xs text-text-secondary">Available once all required documents are verified.</p>
          </div>

          {allRequiredVerified ? (
            <HireConfirmationModal
              applicationId={application.id}
              candidateName={candidateName}
              jobTitle={jobTitle}
              isConfirmed={application.status === "hired" || application.status === "hire_confirmed"}
            />
          ) : (
            <button type="button" disabled className="rounded-xl bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500">
              Confirm hire
            </button>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

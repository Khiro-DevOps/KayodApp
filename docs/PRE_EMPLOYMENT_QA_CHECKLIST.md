Pre-employment QA checklist

Purpose: Validate the end-to-end Sprint 1.5 flow: move applicant to pre-employment, upload documents, HR review, and confirm hire.

Preconditions:
- Use a staging environment with a copy of production data (or a test tenant).
- Ensure Supabase credentials and storage bucket `pre-employment-docs` are available to the app.
- Deploy the current branch containing these changes.

Checklist:

1) Create a Job Offer (HR)
- Log in as an HR user who owns a job posting.
- Create or use an existing job posting with required documents set.
- Verify `job_postings.required_documents` contains expected items.

2) Send Offer and Sign (Applicant)
- Send an offer to a candidate (use an invite flow or create an application in DB).
- Sign the offer (if DocuSeal flow is in staging) or mark as signed.
- Verify the application status becomes `pre_employment` after Move -> Pre-employment or after signed offer as appropriate.

3) Move to Pre-employment (HR)
- From applicant detail, click Move → Pre-employment.
- Set a deadline and instruction note.
- Confirm the `applications.doc_deadline` and `doc_submission_note` are saved.
- Confirm `applicant_documents` rows are created for the application with null `file_url`.

4) Applicant Upload
- As the applicant (or impersonate), open `/apply/applications/{id}/documents`.
- Upload a valid PDF image (less than 10MB) for a required document.
- Observe progress bar and successful toast.
- Verify file appears in Supabase Storage at: `/pre-employment-docs/{application_id}/{document_id}/...` and has a public URL in `applicant_documents.file_url`.

5) HR Review
- As HR, open the applicant documents review page at `/jobs/manage/{jobId}/applicants/{applicationId}/documents`.
- Approve a submitted document.
- Verify `applicant_documents.hr_verified` becomes true, `hr_verified_at` is set, and `submission_type` is `digital`.
- Request resubmission on a different document and verify notes are saved.

6) In-person Submission
- As applicant, choose "I will submit in person" for a document.
- Verify `submission_type` is `in_person` and `file_url` remains null.
- HR marks it as received in person; verify `hr_verified` updates.

7) Confirm Hire
- Once all required documents are verified, open Confirm Hire modal.
- Confirm hire.
- Verify `profiles.role` for the candidate flips to `employee` and `employees` record is created/updated as expected.

8) Edge Cases
- Attempt to upload an unsupported file type (>10MB or .exe) and verify client rejects it and server returns a 400.
- Try simultaneous uploads to ensure no race conditions (two documents uploaded together).
- Verify audit fields `updated_at`, `hr_verified_by` are set correctly.

9) Logging & Observability
- Check server logs for errors during upload/migration actions.
- Verify revalidation (Next.js) calls happen by seeing updated UI without stale cache.

Post-test cleanup:
- Remove test files from the storage bucket to avoid clutter.
- Revert any test users or test data if needed.

Notes:
- The finalize migration `migration/2026_05_29_finalize_employment_type_enum.sql` should only be run after code is deployed and all instances use the underscored labels.
- Back up DB before running the final migration.

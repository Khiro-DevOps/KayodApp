-- ============================================================
-- KAYOD HRIS — Pre-employment requirements migration
-- Adds the document review pipeline between offer acceptance and hire.
-- ============================================================

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'offer_accepted' AFTER 'offer_sent';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'pre_employment' AFTER 'offer_accepted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pre_emp_submission_type AS ENUM ('digital', 'in_person');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS job_required_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_required_documents_job_posting_id
  ON job_required_documents(job_posting_id);

CREATE TABLE IF NOT EXISTS applicant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES job_required_documents(id) ON DELETE CASCADE,
  file_url text,
  submission_type pre_emp_submission_type,
  submitted_at timestamptz,
  hr_verified boolean NOT NULL DEFAULT false,
  hr_verified_at timestamptz,
  hr_verified_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_applicant_documents_application_id
  ON applicant_documents(application_id);

CREATE INDEX IF NOT EXISTS idx_applicant_documents_applicant_id
  ON applicant_documents(applicant_id);

CREATE INDEX IF NOT EXISTS idx_applicant_documents_document_id
  ON applicant_documents(document_id);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS doc_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS doc_submission_note text;

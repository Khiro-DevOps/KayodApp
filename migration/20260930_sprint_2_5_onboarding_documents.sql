-- ============================================================
-- MIGRATION: Sprint 2.5 New-Hire Document Submission Module
-- Migration file: migration/20260930_sprint_2_5_onboarding_documents.sql
-- ============================================================

-- 1. Table: onboarding_document_requirements
CREATE TABLE IF NOT EXISTS onboarding_document_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    document_code VARCHAR(50) NOT NULL,
    document_name TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT onboarding_req_tenant_code_key UNIQUE (tenant_id, document_code)
);

-- 2. Seed default tenant requirements if missing
INSERT INTO onboarding_document_requirements (tenant_id, document_code, document_name, description, is_required)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'valid_id', 'Government Valid ID', 'Primary government-issued ID (Passport, UMID, Driver''s License, SSS ID, etc.)', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'nbi_clearance', 'NBI Clearance', 'Valid NBI Clearance issued within the last 6 months', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'psa_birth_cert', 'PSA Birth Certificate', 'Philippine Statistics Authority (PSA) Birth Certificate', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'sss', 'SSS Document / Number', 'SSS E1/E4 Form, SSS ID, or official proof of SSS Number', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'philhealth', 'PhilHealth Document', 'PhilHealth Member Data Record (MDR) or ID', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'pagibig', 'Pag-IBIG Document', 'Pag-IBIG Member Data Form (MDF) or ID', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'tin', 'TIN Verification / BIR Form 1902', 'Tax Identification Number (TIN) proof or BIR Form 1902/1905', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'photo_2x2', '2x2 ID Photo', 'Recent 2x2 colored photo with white background', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'medical_cert', 'Medical Certificate', 'Fit-to-work pre-employment medical clearance from an accredited clinic', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'diploma_tor', 'Diploma / TOR', 'College/University Diploma or official Transcript of Records', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'coe', 'Certificate of Employment (COE)', 'COE from previous employer(s), if applicable', FALSE)
ON CONFLICT (tenant_id, document_code) DO UPDATE
SET document_name = EXCLUDED.document_name, description = EXCLUDED.description;

-- Seed requirements for all other distinct tenant IDs in the system
INSERT INTO onboarding_document_requirements (tenant_id, document_code, document_name, description, is_required)
SELECT 
  t.tenant_id, 
  def.document_code, 
  def.document_name, 
  def.description, 
  def.is_required
FROM (
  SELECT DISTINCT tenant_id FROM profiles WHERE tenant_id IS NOT NULL AND tenant_id != '00000000-0000-0000-0000-000000000001'::uuid
  UNION
  SELECT DISTINCT tenant_id FROM employees WHERE tenant_id IS NOT NULL AND tenant_id != '00000000-0000-0000-0000-000000000001'::uuid
) t
CROSS JOIN (
  VALUES
    ('valid_id', 'Government Valid ID', 'Primary government-issued ID (Passport, UMID, Driver''s License, SSS ID, etc.)', TRUE),
    ('nbi_clearance', 'NBI Clearance', 'Valid NBI Clearance issued within the last 6 months', TRUE),
    ('psa_birth_cert', 'PSA Birth Certificate', 'Philippine Statistics Authority (PSA) Birth Certificate', TRUE),
    ('sss', 'SSS Document / Number', 'SSS E1/E4 Form, SSS ID, or official proof of SSS Number', TRUE),
    ('philhealth', 'PhilHealth Document', 'PhilHealth Member Data Record (MDR) or ID', TRUE),
    ('pagibig', 'Pag-IBIG Document', 'Pag-IBIG Member Data Form (MDF) or ID', TRUE),
    ('tin', 'TIN Verification / BIR Form 1902', 'Tax Identification Number (TIN) proof or BIR Form 1902/1905', TRUE),
    ('photo_2x2', '2x2 ID Photo', 'Recent 2x2 colored photo with white background', TRUE),
    ('medical_cert', 'Medical Certificate', 'Fit-to-work pre-employment medical clearance from an accredited clinic', TRUE),
    ('diploma_tor', 'Diploma / TOR', 'College/University Diploma or official Transcript of Records', TRUE),
    ('coe', 'Certificate of Employment (COE)', 'COE from previous employer(s), if applicable', FALSE)
) AS def(document_code, document_name, description, is_required)
ON CONFLICT (tenant_id, document_code) DO NOTHING;

-- 3. Table: employee_onboarding_documents
CREATE TABLE IF NOT EXISTS employee_onboarding_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL REFERENCES onboarding_document_requirements(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'submitted',
    rejection_reason TEXT DEFAULT NULL,
    reviewed_by UUID REFERENCES profiles(id) DEFAULT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT employee_onboarding_doc_status_check CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
    CONSTRAINT employee_onboarding_doc_emp_req_key UNIQUE (employee_id, requirement_id)
);

-- 4. Private Storage Bucket: employee-documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- RLS helper definition if not exists
CREATE OR REPLACE FUNCTION is_hr()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('hr_manager', 'admin')
  );
END;
$$;

-- RLS Policies on storage.objects for employee-documents bucket
DROP POLICY IF EXISTS "employee_documents_bucket_employee_insert" ON storage.objects;
CREATE POLICY "employee_documents_bucket_employee_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.profile_id = auth.uid()
        AND (storage.foldername(name))[1] = e.tenant_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  );

DROP POLICY IF EXISTS "employee_documents_bucket_employee_select" ON storage.objects;
CREATE POLICY "employee_documents_bucket_employee_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.profile_id = auth.uid()
        AND (storage.foldername(name))[1] = e.tenant_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  );

DROP POLICY IF EXISTS "employee_documents_bucket_hr_select" ON storage.objects;
CREATE POLICY "employee_documents_bucket_hr_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND is_hr()
  );

DROP POLICY IF EXISTS "employee_documents_bucket_hr_update" ON storage.objects;
CREATE POLICY "employee_documents_bucket_hr_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND is_hr()
  );

DROP POLICY IF EXISTS "employee_documents_bucket_hr_insert" ON storage.objects;
CREATE POLICY "employee_documents_bucket_hr_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND is_hr()
  );

-- RLS Policies on database tables
ALTER TABLE onboarding_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_onboarding_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_document_requirements_select" ON onboarding_document_requirements;
CREATE POLICY "onboarding_document_requirements_select"
  ON onboarding_document_requirements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "onboarding_document_requirements_hr_all" ON onboarding_document_requirements;
CREATE POLICY "onboarding_document_requirements_hr_all"
  ON onboarding_document_requirements FOR ALL
  TO authenticated
  USING (is_hr());

DROP POLICY IF EXISTS "employee_onboarding_documents_select" ON employee_onboarding_documents;
CREATE POLICY "employee_onboarding_documents_select"
  ON employee_onboarding_documents FOR SELECT
  TO authenticated
  USING (
    is_hr()
    OR employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "employee_onboarding_documents_insert" ON employee_onboarding_documents;
CREATE POLICY "employee_onboarding_documents_insert"
  ON employee_onboarding_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    is_hr()
    OR employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "employee_onboarding_documents_update" ON employee_onboarding_documents;
CREATE POLICY "employee_onboarding_documents_update"
  ON employee_onboarding_documents FOR UPDATE
  TO authenticated
  USING (
    is_hr()
    OR employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  );

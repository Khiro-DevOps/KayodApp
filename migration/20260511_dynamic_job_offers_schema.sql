-- ============================================================
-- KAYOD HRIS — Dynamic Offer Letter Schema
-- ============================================================

-- ============================================================
-- CREATE ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE offer_status AS ENUM ('DRAFT', 'SENT', 'NEGOTIATION_PENDING', 'REVISED', 'ACCEPTED', 'DECLINED', 'HIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pay_period AS ENUM ('Bi-weekly', 'Monthly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE work_modality AS ENUM ('Remote', 'Hybrid', 'Onsite');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- CREATE job_offers TABLE (Versioning Support)
-- ============================================================

-- ============================================================
-- DROP EXISTING TABLE TO RECREATE WITH NEW SCHEMA
-- ============================================================
DROP TABLE IF EXISTS job_offers CASCADE;

CREATE TABLE job_offers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_posting_id uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  
  -- Versioning
  version_id integer NOT NULL DEFAULT 1,
  parent_offer_id uuid REFERENCES job_offers(id), -- For tracking prior revisions
  is_active boolean NOT NULL DEFAULT true,

  -- State Machine
  status offer_status NOT NULL DEFAULT 'DRAFT',

  -- JSON Schema Models for Dynamic Field Injection
  job_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  org_hierarchy jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  logistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  benefits_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_clauses jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Docuseal Integration
  docuseal_submission_id text,
  docuseal_status text,
  
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Ensure only one active offer per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_offer_per_app ON job_offers(application_id) WHERE is_active = true;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_offers_application_id ON job_offers(application_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_status ON job_offers(status);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- HR can view offers for their jobs
DROP POLICY IF EXISTS "job_offers_hr_view" ON job_offers;
CREATE POLICY "job_offers_hr_view" ON job_offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_postings jp
      WHERE jp.id = job_offers.job_posting_id
      AND jp.created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('hr_manager', 'admin')
      )
    )
  );

-- HR can insert offers for their jobs
DROP POLICY IF EXISTS "job_offers_hr_insert" ON job_offers;
CREATE POLICY "job_offers_hr_insert" ON job_offers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_postings jp
      WHERE jp.id = job_offers.job_posting_id
      AND jp.created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('hr_manager', 'admin')
      )
    )
  );

-- HR can update offers in DRAFT or NEGOTIATION_PENDING status
DROP POLICY IF EXISTS "job_offers_hr_update" ON job_offers;
CREATE POLICY "job_offers_hr_update" ON job_offers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM job_postings jp
      WHERE jp.id = job_offers.job_posting_id
      AND jp.created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('hr_manager', 'admin')
      )
    ) AND (status IN ('DRAFT', 'NEGOTIATION_PENDING', 'SENT'))
  );

-- Candidate can view their own ACTIVE offers that are SENT or later
DROP POLICY IF EXISTS "job_offers_candidate_view" ON job_offers;
CREATE POLICY "job_offers_candidate_view" ON job_offers
  FOR SELECT USING (
    is_active = true 
    AND status != 'DRAFT'
    AND EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = job_offers.application_id
      AND a.candidate_id = auth.uid()
    )
  );
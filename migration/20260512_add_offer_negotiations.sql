-- ============================================================
-- KAYOD HRIS - Job Offer Negotiations & Versioning
-- ============================================================

-- 1. Ensure job_offers has correct schema references and columns
-- Use job_listings (correct table) instead of job_postings
ALTER TABLE job_offers 
  DROP CONSTRAINT IF EXISTS job_offers_job_posting_id_fkey;

DO $$ BEGIN
    ALTER TABLE job_offers RENAME COLUMN job_posting_id TO job_id;
EXCEPTION
    WHEN undefined_column THEN null;
END $$;

ALTER TABLE job_offers 
  ADD CONSTRAINT job_offers_job_id_fkey FOREIGN KEY (job_id) REFERENCES job_listings(id) ON DELETE CASCADE;

-- Default status to 'pending_review' or 'negotiating'
-- Since ENUMs are immutable without some work in PG, let's make sure the type is updated
DO $$
BEGIN
    ALTER TYPE offer_status ADD VALUE 'PENDING_REVIEW';
    ALTER TYPE offer_status ADD VALUE 'NEGOTIATING';
    ALTER TYPE offer_status ADD VALUE 'FINALIZED';
    ALTER TYPE offer_status ADD VALUE 'SIGNED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Let's just use text for standard status or keep offer_status.
-- I'll alter job_offers to use text to be more flexible, or just use the newly added enum values.
-- Wait, if job_offers uses `offer_status`, I will use 'PENDING_REVIEW', 'NEGOTIATING', 'SIGNED', 'FINALIZED'.

-- Add missing dynamic fields to job_offers 
ALTER TABLE job_offers 
  ADD COLUMN IF NOT EXISTS salary numeric,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS work_setup text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS probation_days integer,
  ADD COLUMN IF NOT EXISTS latest_docuseal_url text;

-- 2. Create job_offer_negotiations table
CREATE TABLE IF NOT EXISTS job_offer_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES job_offers(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  initiator_id uuid REFERENCES profiles(id),
  initiator_role text CHECK (initiator_role IN ('applicant', 'hr')),
  target_field text,
  requested_value jsonb,
  comments text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_offer_negotiations_offer_id ON job_offer_negotiations(offer_id);

ALTER TABLE job_offer_negotiations ENABLE ROW LEVEL SECURITY;

-- 3. Trigger for Finalizing Hire
CREATE OR REPLACE FUNCTION handle_hire_finalization()
RETURNS TRIGGER AS $$
DECLARE
  v_applicant_profile_id uuid;
BEGIN
  -- Execute ONLY when the HR sets the offer status to 'FINALIZED'
  IF NEW.status = 'FINALIZED' AND OLD.status != 'FINALIZED' THEN
    
    -- 1. Fetch the profile ID linked to the application
    SELECT candidate_id INTO v_applicant_profile_id
    FROM applications 
    WHERE id = NEW.application_id;

    -- 2. Update Application Status
    UPDATE applications 
    SET 
      status = 'hired',
      updated_at = NOW()
    WHERE id = NEW.application_id;

    -- 3. Transition the Profile Role (Applicant -> Employee)
    UPDATE profiles
    SET 
      role = 'employee', 
      onboarding_status = 'pending_setup',
      department = NEW.department,
      updated_at = NOW()
    WHERE id = v_applicant_profile_id;
    
    -- 4. Insert notification
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications') THEN
        INSERT INTO notifications (user_id, type, title, message)
        VALUES (
          v_applicant_profile_id,
          'system',
          'Welcome to the Team!',
          'Your employment contract has been finalized. Please proceed to the Employee Dashboard to begin your onboarding.'
        );
    END IF;

  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_finalize_hire ON job_offers;
CREATE TRIGGER trigger_finalize_hire
AFTER UPDATE OF status ON job_offers
FOR EACH ROW
EXECUTE FUNCTION handle_hire_finalization();

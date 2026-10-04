-- ============================================================
-- MIGRATION: Sprint 2.1 Multi-Job Application Tracker
-- Table: applications (or job_applications alias/table)
-- ============================================================

-- 1. Create table `job_applications` if it does not exist (mirroring or replacing `applications` schema requirement)
CREATE TABLE IF NOT EXISTS job_applications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  applicant_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id           UUID REFERENCES resumes(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'applied',
  cover_letter        TEXT,
  match_score         NUMERIC(5,2),
  hr_notes            TEXT,
  rejection_reason    TEXT,
  withdrawn_at        TIMESTAMPTZ,
  status_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT job_applications_status_check
    CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  CONSTRAINT job_applications_applicant_job_unique
    UNIQUE (applicant_id, job_id)
);

-- 2. Update existing `job_applications` or `applications` columns if table already existed
DO $$
BEGIN
  -- Ensure unique composite constraint on (applicant_id, job_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_applicant_job_unique'
  ) THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT job_applications_applicant_job_unique UNIQUE (applicant_id, job_id);
  END IF;

  -- Ensure status check constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_status_check'
  ) THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT job_applications_status_check
      CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'));
  END IF;

  -- Add optional columns if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_applications' AND column_name = 'withdrawn_at') THEN
    ALTER TABLE job_applications ADD COLUMN withdrawn_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_applications' AND column_name = 'status_updated_at') THEN
    ALTER TABLE job_applications ADD COLUMN status_updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_applications' AND column_name = 'rejection_reason') THEN
    ALTER TABLE job_applications ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- 3. Enable RLS and setup policies
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_applications_select_own" ON job_applications;
CREATE POLICY "job_applications_select_own" ON job_applications
  FOR SELECT USING (auth.uid() = applicant_id OR is_hr());

DROP POLICY IF EXISTS "job_applications_insert_own" ON job_applications;
CREATE POLICY "job_applications_insert_own" ON job_applications
  FOR INSERT WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "job_applications_update_own" ON job_applications;
CREATE POLICY "job_applications_update_own" ON job_applications
  FOR UPDATE USING (auth.uid() = applicant_id OR is_hr());

-- Also ensure applications table has matching constraints/columns if both exist in the system
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'withdrawn_at') THEN
      ALTER TABLE applications ADD COLUMN withdrawn_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'status_updated_at') THEN
      ALTER TABLE applications ADD COLUMN status_updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'rejection_reason') THEN
      ALTER TABLE applications ADD COLUMN rejection_reason TEXT;
    END IF;
  END IF;
END $$;

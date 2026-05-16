-- ============================================================
-- MIGRATION: Add custom ENUM work_setup and locations table
-- ============================================================

-- 1. Create work_setup ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_setup') THEN
    CREATE TYPE work_setup AS ENUM ('remote', 'wfh', 'onsite', 'hybrid');
  END IF;
END
$$;

-- 2. Create standardized locations table
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  location_type text NOT NULL CHECK (location_type IN ('city', 'province')),
  parent_id uuid REFERENCES locations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Update profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_setup work_setup,
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS province_id uuid REFERENCES locations(id) ON DELETE SET NULL;

-- 4. Update job_postings table
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS work_setup work_setup,
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS province_id uuid REFERENCES locations(id) ON DELETE SET NULL;

-- 5. Migrate existing 'is_remote' flag to 'work_setup' enum on job_postings to preserve 'remote' entries
UPDATE job_postings
SET work_setup = 'remote'
WHERE is_remote = true AND work_setup IS NULL;

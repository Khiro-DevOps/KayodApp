-- ============================================================
-- MIGRATION: 20261119_offer_negotiations.sql
-- Purpose: Ensure job_offer_negotiations schema, columns,
--          status check, canonical job_applications FK,
--          RLS (enabled with no policies), and index.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create table if not exists
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_offer_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.job_offers(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  initiator_id uuid REFERENCES public.profiles(id),
  round int DEFAULT 1,
  target_field text,
  current_value jsonb,
  requested_value jsonb,
  comments text,
  status text DEFAULT 'pending',
  counter_value jsonb,
  hr_comment text,
  resolved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- ------------------------------------------------------------
-- 2. Ensure all columns exist (table may exist from 20260512)
-- ------------------------------------------------------------
ALTER TABLE public.job_offer_negotiations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.job_offers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS initiator_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS round int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_field text,
  ADD COLUMN IF NOT EXISTS current_value jsonb,
  ADD COLUMN IF NOT EXISTS requested_value jsonb,
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS counter_value jsonb,
  ADD COLUMN IF NOT EXISTS hr_comment text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- ------------------------------------------------------------
-- 3. Rebuild status check constraint:
--    pending, approved, countered, rejected
-- ------------------------------------------------------------
ALTER TABLE public.job_offer_negotiations
  DROP CONSTRAINT IF EXISTS job_offer_negotiations_status_check;

ALTER TABLE public.job_offer_negotiations
  ADD CONSTRAINT job_offer_negotiations_status_check
  CHECK (status IN ('pending', 'approved', 'countered', 'rejected'));

-- ------------------------------------------------------------
-- 4. Repoint application_id FK to public.job_applications(id)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL
     AND to_regclass('public.job_offer_negotiations') IS NOT NULL
  THEN
    ALTER TABLE public.job_offer_negotiations
      DROP CONSTRAINT IF EXISTS job_offer_negotiations_application_id_fkey;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass('public.job_offer_negotiations')
        AND conname = 'job_offer_negotiations_application_id_job_applications_fkey'
    ) THEN
      ALTER TABLE public.job_offer_negotiations
        ADD CONSTRAINT job_offer_negotiations_application_id_job_applications_fkey
        FOREIGN KEY (application_id)
        REFERENCES public.job_applications(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 5. Enable RLS with NO policies (server actions via admin only)
-- ------------------------------------------------------------
ALTER TABLE public.job_offer_negotiations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 6. Index on (application_id, status)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_offer_negotiations_application_id_status
  ON public.job_offer_negotiations(application_id, status);

-- ============================================================
-- 7. VERIFICATION BLOCK (SELECT ONLY - COMMENTED)
-- ============================================================
-- -- 7a. Columns of job_offer_negotiations
-- SELECT
--   column_name,
--   data_type,
--   udt_name,
--   is_nullable,
--   column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'job_offer_negotiations'
-- ORDER BY ordinal_position;
--
-- -- 7b. Check and FK constraints on job_offer_negotiations
-- SELECT
--   conname AS constraint_name,
--   contype AS constraint_type,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = to_regclass('public.job_offer_negotiations')
-- ORDER BY conname;
--
-- -- 7c. RLS enabled and policies on job_offer_negotiations (expect relrowsecurity = true, 0 policies)
-- SELECT
--   relname AS table_name,
--   relrowsecurity AS rls_enabled
-- FROM pg_class
-- WHERE oid = to_regclass('public.job_offer_negotiations');
--
-- SELECT
--   policyname,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'job_offer_negotiations';
--
-- -- 7d. Indexes on job_offer_negotiations
-- SELECT
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'job_offer_negotiations'
-- ORDER BY indexname;

-- Add target_job_level to public.job_postings if not already present
ALTER TABLE IF EXISTS public.job_postings
  ADD COLUMN IF NOT EXISTS target_job_level text NOT NULL DEFAULT 'staff';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_postings_target_job_level_check'
  ) THEN
    ALTER TABLE public.job_postings
      ADD CONSTRAINT job_postings_target_job_level_check
      CHECK (target_job_level IN ('staff', 'team_lead', 'supervisor', 'manager'));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

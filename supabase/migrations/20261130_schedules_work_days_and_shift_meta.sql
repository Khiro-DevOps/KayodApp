-- Migration: Ensure public.schedules has work_days and shift metadata columns
-- Fixes PostgREST schema cache error: "Could not find the 'work_days' column of 'schedules' in the schema cache"
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).

ALTER TABLE IF EXISTS public.schedules
  ADD COLUMN IF NOT EXISTS work_days text[],
  ADD COLUMN IF NOT EXISTS shift_start text,
  ADD COLUMN IF NOT EXISTS shift_end text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

NOTIFY pgrst, 'reload schema';

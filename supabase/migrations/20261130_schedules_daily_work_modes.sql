-- Migration: Add daily_work_modes jsonb to public.schedules and public.employees
-- Enables per-day Onsite / WFH / Rest Day roster assignment by Direct Supervisors / Team Leads.
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).

ALTER TABLE IF EXISTS public.schedules
  ADD COLUMN IF NOT EXISTS daily_work_modes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS daily_work_modes jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';

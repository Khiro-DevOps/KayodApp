-- ============================================================================
-- PHASE 3 UPGRADE: Undertime Types (Early Out, Late In, Half-Day 1st/2nd)
-- and Fractional Leave Offset Tracking
-- File: supabase/migrations/20261205_undertime_halfday_and_leave_offset.sql
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Create public.undertime_type enum
DO $$
BEGIN
  CREATE TYPE public.undertime_type AS ENUM (
    'early_out',
    'late_in',
    'half_day_first',
    'half_day_second'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Extend public.undertime_requests non-destructively
ALTER TABLE public.undertime_requests
  ADD COLUMN IF NOT EXISTS undertime_type public.undertime_type NOT NULL DEFAULT 'early_out',
  ADD COLUMN IF NOT EXISTS scheduled_in time,
  ADD COLUMN IF NOT EXISTS requested_in time,
  ADD COLUMN IF NOT EXISTS leave_credits_deducted numeric(6,4) NOT NULL DEFAULT 0;

ALTER TABLE public.undertime_requests
  ALTER COLUMN requested_out DROP NOT NULL;

ALTER TABLE public.undertime_requests
  DROP CONSTRAINT IF EXISTS chk_undertime_requests_leave_credits_non_negative;
ALTER TABLE public.undertime_requests
  ADD CONSTRAINT chk_undertime_requests_leave_credits_non_negative
  CHECK (leave_credits_deducted >= 0);

-- 3. Widen employee_leave_balances precision to support 4-decimal fractional offsets (e.g. 0.1875d)
DO $$
BEGIN
  ALTER TABLE public.employee_leave_balances
    ALTER COLUMN entitled_days TYPE numeric(7,4),
    ALTER COLUMN used_days TYPE numeric(7,4),
    ALTER COLUMN pending_days TYPE numeric(7,4);
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIX: Extend public.leave_type enum for Phase 2 statutory & ledger leave types
-- File: supabase/migrations/20261202_fix_leave_type_enum_and_mapping.sql
-- Safe to run multiple times (idempotent ADD VALUE IF NOT EXISTS)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'leave_type'
      AND t.typtype = 'e'
  ) THEN
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'vacation';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'sick';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'sil';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'paternity';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'maternity';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'solo_parent';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'vawc';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'magna_carta';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'emergency';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'unpaid';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'other';
    -- Backwards compatibility if any client submits uppercase ledger codes
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'VL';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'SL';
    ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'SIL';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

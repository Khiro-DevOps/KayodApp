-- Finalize employment_type enum rename
-- This migration attempts to rename `employment_type_repair` -> `employment_type` if safe.
-- Run during a maintenance window. It will NOT drop an existing `employment_type` that's still in use.

DO $$
BEGIN
  -- If repair type does not exist, nothing to do
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type_repair') THEN
    RAISE NOTICE 'No employment_type_repair type found; nothing to do.';
    RETURN;
  END IF;

  -- If target type does not exist, simply rename
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    ALTER TYPE employment_type_repair RENAME TO employment_type;
    RAISE NOTICE 'Renamed employment_type_repair -> employment_type';
    RETURN;
  END IF;

  -- If target exists but is unused, drop it and rename
  PERFORM 1 FROM pg_attribute WHERE atttypid = (SELECT oid FROM pg_type WHERE typname = 'employment_type') LIMIT 1;
  IF NOT FOUND THEN
    EXECUTE 'DROP TYPE IF EXISTS employment_type';
    ALTER TYPE employment_type_repair RENAME TO employment_type;
    RAISE NOTICE 'Dropped unused employment_type and renamed repair -> employment_type';
    RETURN;
  END IF;

  -- Otherwise, fail with notice so operator can inspect
  RAISE NOTICE 'Cannot finalize enum rename: existing ''employment_type'' is in use. Manual reconciliation required.';
END$$;

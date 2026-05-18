-- ============================================================
-- KAYOD HRIS — Hire Confirmation Status Migration
-- Adds the application and notification values required for HR hire confirmation.
-- ============================================================

DO $$
BEGIN
  ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'hire_confirmed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'hire_confirmed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION promote_to_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF new.status IN ('hired', 'hire_confirmed') AND old.status IS DISTINCT FROM new.status THEN
    UPDATE profiles SET role = 'employee' WHERE id = new.candidate_id;
  END IF;
  RETURN new;
END;
$$;
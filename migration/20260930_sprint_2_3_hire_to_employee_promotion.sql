-- ============================================================
-- MIGRATION: Sprint 2.3 Hire-to-Employee Promotion Pipeline & Data Remediation
-- Migration file: migration/20260930_sprint_2_3_hire_to_employee_promotion.sql
-- ============================================================

-- 1. Table Schema Audit & Adjustments on `employees`

-- Ensure required columns exist on `employees`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'tenant_id') THEN
    ALTER TABLE employees ADD COLUMN tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'application_id') THEN
    ALTER TABLE employees ADD COLUMN application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'job_offer_id') THEN
    ALTER TABLE employees ADD COLUMN job_offer_id UUID REFERENCES job_offers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'salary') THEN
    ALTER TABLE employees ADD COLUMN salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'work_location_id') THEN
    ALTER TABLE employees ADD COLUMN work_location_id UUID REFERENCES office_branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'work_mode') THEN
    ALTER TABLE employees ADD COLUMN work_mode VARCHAR(50) DEFAULT 'onsite';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'shift_start') THEN
    ALTER TABLE employees ADD COLUMN shift_start TIME DEFAULT '08:00:00';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'shift_end') THEN
    ALTER TABLE employees ADD COLUMN shift_end TIME DEFAULT '17:00:00';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'work_days') THEN
    ALTER TABLE employees ADD COLUMN work_days TEXT[] DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'probation_end_date') THEN
    ALTER TABLE employees ADD COLUMN probation_end_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'start_date') THEN
    ALTER TABLE employees ADD COLUMN start_date DATE DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Check constraints adjustment on `employees`
DO $$
BEGIN
  -- Check constraint for work_mode: ('onsite', 'hybrid', 'remote')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_work_mode_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_work_mode_check
      CHECK (work_mode IN ('onsite', 'hybrid', 'remote'));
  END IF;

  -- Ensure employment_status allows ('onboarding', 'active', 'separated')
  -- Note: existing table might use enum or check. If varchar/check:
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_status_check'
  ) THEN
    ALTER TABLE employees DROP CONSTRAINT employees_employment_status_check;
  END IF;
END $$;

-- Ensure profile_id is NOT NULL for active/onboarding employees
DO $$
BEGIN
  -- Ensure constraint or column alter where possible
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'profile_id' AND is_nullable = 'YES'
  ) THEN
    -- Make profile_id non-null if clean
    UPDATE employees SET profile_id = id WHERE profile_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = employees.id);
    -- We can set NOT NULL if no nulls remain
    IF NOT EXISTS (SELECT 1 FROM employees WHERE profile_id IS NULL) THEN
      ALTER TABLE employees ALTER COLUMN profile_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 2. Data Remediation Script (Idempotent SQL Fix)
DO $$
BEGIN
  -- Backfill employees.profile_id where missing by matching job_applications.applicant_id
  UPDATE employees e
  SET profile_id = ja.applicant_id
  FROM job_applications ja
  WHERE e.application_id = ja.id
    AND e.profile_id IS NULL;

  -- Backfill employees.salary and employees.base_salary from job_offers where salary = 0 or NULL
  UPDATE employees e
  SET 
    salary = COALESCE(
      (jo.financial_package->>'offered_salary')::NUMERIC(12,2),
      (jo.job_metadata->>'offered_salary')::NUMERIC(12,2),
      (jo.job_metadata->>'salary')::NUMERIC(12,2),
      jo.salary,
      e.salary,
      e.base_salary,
      0.00
    ),
    base_salary = CASE 
      WHEN e.base_salary IS NULL OR e.base_salary = 0 THEN 
        COALESCE(
          (jo.financial_package->>'offered_salary')::NUMERIC(12,2),
          (jo.job_metadata->>'offered_salary')::NUMERIC(12,2),
          (jo.job_metadata->>'salary')::NUMERIC(12,2),
          jo.salary,
          e.base_salary,
          0.00
        )
      ELSE e.base_salary
    END
  FROM job_offers jo
  WHERE (e.job_offer_id = jo.id OR e.application_id = jo.application_id)
    AND (e.salary = 0 OR e.salary IS NULL OR e.base_salary = 0 OR e.base_salary IS NULL);

  -- Backfill missing work_location_id, work_mode, and shift defaults from accepted job_offers
  UPDATE employees e
  SET 
    work_location_id = COALESCE(
      e.work_location_id,
      (jo.logistics->>'work_location_id')::UUID,
      (SELECT id FROM office_branches LIMIT 1)
    ),
    work_mode = COALESCE(
      e.work_mode,
      LOWER(jo.logistics->>'work_mode'),
      LOWER(jo.logistics->>'work_arrangement'),
      'onsite'
    ),
    shift_start = COALESCE(
      e.shift_start,
      (jo.logistics->>'shift_start')::TIME,
      '08:00:00'::TIME
    ),
    shift_end = COALESCE(
      e.shift_end,
      (jo.logistics->>'shift_end')::TIME,
      '17:00:00'::TIME
    )
  FROM job_offers jo
  WHERE (e.job_offer_id = jo.id OR e.application_id = jo.application_id)
    AND (e.work_location_id IS NULL OR e.work_mode IS NULL);
END $$;

-- 3. RLS Security Policies on `employees`
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Helper check for HR users tenant matching or role
CREATE OR REPLACE FUNCTION is_hr()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('hr_manager', 'admin')
  );
END;
$$;

DROP POLICY IF EXISTS "employees_hr_all" ON employees;
CREATE POLICY "employees_hr_all" ON employees
  FOR ALL
  USING (
    is_hr() AND (
      tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
      OR (SELECT tenant_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
  WITH CHECK (
    is_hr() AND (
      tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
      OR (SELECT tenant_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  );

DROP POLICY IF EXISTS "employees_select_own" ON employees;
CREATE POLICY "employees_select_own" ON employees
  FOR SELECT
  USING (profile_id = auth.uid());

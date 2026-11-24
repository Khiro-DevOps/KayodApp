-- ============================================================================
-- PHASE 2: Leave Credits Pipeline, Multi-Tier Approvals & Hybrid Shift Metrics
-- File: supabase/migrations/20261201_phase2_leave_credits_and_routing.sql
-- Safe to run multiple times (idempotent ADD COLUMN / CREATE TABLE IF NOT EXISTS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PILLAR 1: End-to-End Leave Credits Pipeline
-- ----------------------------------------------------------------------------

-- 1. job_postings: structured leave policy columns
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS leave_policy_type text NOT NULL DEFAULT 'company_standard',
  ADD COLUMN IF NOT EXISTS vacation_leave_days numeric(5,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS sick_leave_days numeric(5,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS service_incentive_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_eligibility text NOT NULL DEFAULT 'upon_regularization';

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS chk_job_postings_leave_policy_type;
ALTER TABLE public.job_postings
  ADD CONSTRAINT chk_job_postings_leave_policy_type
  CHECK (leave_policy_type IN ('company_standard', 'statutory_sil', 'custom'));

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS chk_job_postings_leave_eligibility;
ALTER TABLE public.job_postings
  ADD CONSTRAINT chk_job_postings_leave_eligibility
  CHECK (leave_eligibility IN ('day_1', 'upon_regularization'));

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS chk_job_postings_leave_days_non_negative;
ALTER TABLE public.job_postings
  ADD CONSTRAINT chk_job_postings_leave_days_non_negative
  CHECK (
    vacation_leave_days >= 0
    AND sick_leave_days >= 0
    AND service_incentive_leave_days >= 0
  );

-- 2. job_offers: matching structured leave columns alongside job_metadata
ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS leave_policy_type text NOT NULL DEFAULT 'company_standard',
  ADD COLUMN IF NOT EXISTS vacation_leave_days numeric(5,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS sick_leave_days numeric(5,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS service_incentive_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_eligibility text NOT NULL DEFAULT 'upon_regularization';

ALTER TABLE public.job_offers
  DROP CONSTRAINT IF EXISTS chk_job_offers_leave_policy_type;
ALTER TABLE public.job_offers
  ADD CONSTRAINT chk_job_offers_leave_policy_type
  CHECK (leave_policy_type IN ('company_standard', 'statutory_sil', 'custom'));

ALTER TABLE public.job_offers
  DROP CONSTRAINT IF EXISTS chk_job_offers_leave_eligibility;
ALTER TABLE public.job_offers
  ADD CONSTRAINT chk_job_offers_leave_eligibility
  CHECK (leave_eligibility IN ('day_1', 'upon_regularization'));

ALTER TABLE public.job_offers
  DROP CONSTRAINT IF EXISTS chk_job_offers_leave_days_non_negative;
ALTER TABLE public.job_offers
  ADD CONSTRAINT chk_job_offers_leave_days_non_negative
  CHECK (
    vacation_leave_days >= 0
    AND sick_leave_days >= 0
    AND service_incentive_leave_days >= 0
  );

-- 3. employee_leave_balances: Tenant-Scoped Annual Leave Ledger
CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year int NOT NULL,
  leave_type text NOT NULL CHECK (
    leave_type IN (
      'VL',
      'SL',
      'SIL',
      'PATERNITY',
      'MATERNITY',
      'SOLO_PARENT',
      'VAWC',
      'MAGNA_CARTA'
    )
  ),
  entitled_days numeric(5,2) NOT NULL DEFAULT 0 CHECK (entitled_days >= 0),
  used_days numeric(5,2) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  pending_days numeric(5,2) NOT NULL DEFAULT 0 CHECK (pending_days >= 0),
  eligibility text NOT NULL DEFAULT 'upon_regularization' CHECK (
    eligibility IN ('day_1', 'upon_regularization')
  ),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, leave_type)
);

CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_tenant_emp_year
  ON public.employee_leave_balances (tenant_id, employee_id, year);

CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_emp_year
  ON public.employee_leave_balances (employee_id, year);

ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_leave_balances_self_select" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_self_select"
ON public.employee_leave_balances
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_leave_balances.employee_id
      AND e.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "employee_leave_balances_supervisor_select" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_supervisor_select"
ON public.employee_leave_balances
FOR SELECT
USING (
  public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "employee_leave_balances_hr_select" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_hr_select"
ON public.employee_leave_balances
FOR SELECT
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist', 'payroll_officer'])
);

DROP POLICY IF EXISTS "employee_leave_balances_hr_manage" ON public.employee_leave_balances;
CREATE POLICY "employee_leave_balances_hr_manage"
ON public.employee_leave_balances
FOR ALL
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
)
WITH CHECK (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
);

-- ----------------------------------------------------------------------------
-- PILLAR 2: Multi-Tier Leave & Overtime Approval Routing
-- ----------------------------------------------------------------------------

-- 4. leave_requests: two-stage approval status + audit columns
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_remarks text,
  ADD COLUMN IF NOT EXISTS hr_reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hr_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_remarks text,
  ADD COLUMN IF NOT EXISTS requires_document_verification boolean NOT NULL DEFAULT false;

-- Safely extend leave_requests.status whether it is a CHECK-constrained text column or a PostgreSQL enum
DO $$
DECLARE
  v_udt_name text;
  v_constraint_name text;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'leave_requests'
    AND c.column_name = 'status';

  IF v_udt_name IS NOT NULL AND v_udt_name NOT IN ('text', 'varchar', 'bpchar') THEN
    -- Enum column: add new enum labels if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = v_udt_name AND e.enumlabel = 'pending_supervisor'
    ) THEN
      EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_udt_name, 'pending_supervisor');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = v_udt_name AND e.enumlabel = 'pending_hr'
    ) THEN
      EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_udt_name, 'pending_hr');
    END IF;
  ELSE
    -- Text column: drop any old status check constraints and install the Phase 2 check
    FOR v_constraint_name IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'leave_requests'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    END LOOP;

    ALTER TABLE public.leave_requests
      ADD CONSTRAINT chk_leave_requests_status
      CHECK (
        status IN (
          'pending',
          'pending_supervisor',
          'pending_hr',
          'approved',
          'rejected',
          'cancelled'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_requests_status_employee
  ON public.leave_requests (status, employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_supervisor_status
  ON public.leave_requests (supervisor_id, status);

-- Allow direct supervisors to SELECT and UPDATE their direct reports' leave requests
DROP POLICY IF EXISTS "leave_requests_supervisor_select" ON public.leave_requests;
CREATE POLICY "leave_requests_supervisor_select"
ON public.leave_requests
FOR SELECT
USING (
  public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "leave_requests_supervisor_update" ON public.leave_requests;
CREATE POLICY "leave_requests_supervisor_update"
ON public.leave_requests
FOR UPDATE
USING (
  public.is_direct_supervisor(employee_id)
)
WITH CHECK (
  public.is_direct_supervisor(employee_id)
);

-- 5. overtime_requests: two-stage approval status + audit columns
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_remarks text,
  ADD COLUMN IF NOT EXISTS hr_reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hr_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_remarks text;

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'overtime_requests'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.overtime_requests DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.overtime_requests
  ADD CONSTRAINT chk_overtime_requests_status
  CHECK (
    status IN (
      'pending',
      'pending_supervisor',
      'pending_hr',
      'approved',
      'rejected',
      'cancelled',
      'expired'
    )
  );

CREATE INDEX IF NOT EXISTS idx_overtime_requests_supervisor_status
  ON public.overtime_requests (supervisor_id, status);

-- Update overtime_requests RLS policies for multi-tier statuses & supervisors
DROP POLICY IF EXISTS "overtime_requests_employee_insert" ON public.overtime_requests;
CREATE POLICY "overtime_requests_employee_insert" ON public.overtime_requests
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = overtime_requests.employee_id
      AND e.profile_id = auth.uid()
  )
  AND requested_by = auth.uid()
  AND status IN ('pending', 'pending_supervisor', 'pending_hr')
  AND reviewed_by IS NULL
);

DROP POLICY IF EXISTS "overtime_requests_employee_cancel" ON public.overtime_requests;
CREATE POLICY "overtime_requests_employee_cancel" ON public.overtime_requests
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = overtime_requests.employee_id
      AND e.profile_id = auth.uid()
  )
  AND (
    status IN ('pending', 'pending_supervisor', 'pending_hr')
    OR (status = 'approved' AND used_at IS NULL)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = overtime_requests.employee_id
      AND e.profile_id = auth.uid()
  )
  AND status = 'cancelled'
);

DROP POLICY IF EXISTS "overtime_requests_supervisor_select" ON public.overtime_requests;
CREATE POLICY "overtime_requests_supervisor_select" ON public.overtime_requests
FOR SELECT USING (
  public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "overtime_requests_supervisor_update" ON public.overtime_requests;
CREATE POLICY "overtime_requests_supervisor_update" ON public.overtime_requests
FOR UPDATE USING (
  public.is_direct_supervisor(employee_id)
) WITH CHECK (
  public.is_direct_supervisor(employee_id)
);

-- ----------------------------------------------------------------------------
-- PILLAR 3: Hybrid Geofence & Rotating / Overnight Shift Metrics
-- ----------------------------------------------------------------------------

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS is_rest_day_work boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS undertime_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_diff_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_work_mode text,
  ADD COLUMN IF NOT EXISTS rest_day_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rest_day_verified_at timestamptz;

NOTIFY pgrst, 'reload schema';

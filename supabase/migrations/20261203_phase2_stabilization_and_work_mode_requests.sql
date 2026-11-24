-- ============================================================================
-- PHASE 2 STABILIZATION: 15 VL + 15 SL Defaults, Backfill, Enum Guards &
-- Employee Last-Minute Work Mode Change Requests
-- File: supabase/migrations/20261203_phase2_stabilization_and_work_mode_requests.sql
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Standardize default leave credits to 15 VL + 15 SL on job_postings & job_offers
ALTER TABLE public.job_postings
  ALTER COLUMN vacation_leave_days SET DEFAULT 15,
  ALTER COLUMN sick_leave_days SET DEFAULT 15;

ALTER TABLE public.job_offers
  ALTER COLUMN vacation_leave_days SET DEFAULT 15,
  ALTER COLUMN sick_leave_days SET DEFAULT 15;

-- 2. Idempotent backfill for all existing active employees in the current year (15 VL + 15 SL)
INSERT INTO public.employee_leave_balances (
  tenant_id,
  employee_id,
  year,
  leave_type,
  entitled_days,
  used_days,
  pending_days,
  eligibility,
  is_active
)
SELECT
  e.tenant_id,
  e.id,
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  lt.leave_type,
  15,
  0,
  0,
  'day_1',
  true
FROM public.employees e
CROSS JOIN (VALUES ('VL'), ('SL')) AS lt(leave_type)
WHERE e.tenant_id IS NOT NULL
  AND COALESCE(e.employment_status::text, 'active') IN ('active', 'onboarding', 'probationary', 'regular')
ON CONFLICT (employee_id, year, leave_type) DO NOTHING;

-- 3. Extend leave_status / overtime_status enums (if PostgreSQL enum types exist)
DO $$
DECLARE
  v_enum_name text;
BEGIN
  FOR v_enum_name IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND t.typname IN ('leave_status', 'overtime_status', 'leave_request_status')
  LOOP
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_enum_name, 'pending_supervisor');
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_enum_name, 'pending_hr');
  END LOOP;
END $$;

-- 4. work_mode_requests: Employee last-minute work mode change request -> Team Lead approval
CREATE TABLE IF NOT EXISTS public.work_mode_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  supervisor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  request_date date NOT NULL,
  requested_mode text NOT NULL CHECK (requested_mode IN ('onsite', 'wfh')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_supervisor' CHECK (
    status IN ('pending_supervisor', 'approved', 'rejected', 'cancelled')
  ),
  reviewed_at timestamptz,
  reviewer_remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_mode_requests_emp_date
  ON public.work_mode_requests (employee_id, request_date);

CREATE INDEX IF NOT EXISTS idx_work_mode_requests_supervisor_status
  ON public.work_mode_requests (supervisor_id, status);

ALTER TABLE public.work_mode_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_mode_requests_employee_select" ON public.work_mode_requests;
CREATE POLICY "work_mode_requests_employee_select"
ON public.work_mode_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = work_mode_requests.employee_id
      AND e.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "work_mode_requests_employee_insert" ON public.work_mode_requests;
CREATE POLICY "work_mode_requests_employee_insert"
ON public.work_mode_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = work_mode_requests.employee_id
      AND e.profile_id = auth.uid()
  )
  AND status = 'pending_supervisor'
);

DROP POLICY IF EXISTS "work_mode_requests_supervisor_select" ON public.work_mode_requests;
CREATE POLICY "work_mode_requests_supervisor_select"
ON public.work_mode_requests
FOR SELECT
USING (
  public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "work_mode_requests_supervisor_update" ON public.work_mode_requests;
CREATE POLICY "work_mode_requests_supervisor_update"
ON public.work_mode_requests
FOR UPDATE
USING (
  public.is_direct_supervisor(employee_id)
)
WITH CHECK (
  public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "work_mode_requests_hr_select" ON public.work_mode_requests;
CREATE POLICY "work_mode_requests_hr_select"
ON public.work_mode_requests
FOR SELECT
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist', 'payroll_officer'])
);

-- 5. overtime_requests: Add overtime_type ('regular_ot' | 'rdot')
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS overtime_type text NOT NULL DEFAULT 'regular_ot';

ALTER TABLE public.overtime_requests
  DROP CONSTRAINT IF EXISTS chk_overtime_requests_overtime_type;
ALTER TABLE public.overtime_requests
  ADD CONSTRAINT chk_overtime_requests_overtime_type
  CHECK (overtime_type IN ('regular_ot', 'rdot'));

-- 6. Ensure is_direct_supervisor casts employment_status::text safely
CREATE OR REPLACE FUNCTION public.is_direct_supervisor(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees sub
    JOIN public.employees sup ON sub.reports_to = sup.id
    WHERE sub.id = p_employee_id
      AND sup.profile_id = auth.uid()
      AND sup.employment_status::text = 'active'
  );
$$;

NOTIFY pgrst, 'reload schema';

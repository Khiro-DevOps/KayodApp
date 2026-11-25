-- ============================================================================
-- PHASE 3: Undertime Request Workflow Schema & RLS Policies
-- File: supabase/migrations/20261204_phase3_undertime_requests.sql
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Status enum for two-step Philippine operational/HR undertime workflow
DO $$
BEGIN
  CREATE TYPE public.undertime_status AS ENUM (
    'pending_supervisor',
    'pending_hr',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Helper: resolve current authenticated user's active employee_id
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.profile_id = auth.uid()
  ORDER BY (e.employment_status::text = 'active') DESC, e.created_at DESC
  LIMIT 1;
$$;

-- 3. Table: public.undertime_requests
CREATE TABLE IF NOT EXISTS public.undertime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  scheduled_out time NOT NULL,
  requested_out time NOT NULL,
  undertime_minutes int NOT NULL CHECK (undertime_minutes > 0 AND undertime_minutes < 480),
  reason text NOT NULL,
  coverage_notes text,
  deduction_mode text NOT NULL DEFAULT 'payroll_deduction'
    CHECK (deduction_mode IN ('payroll_deduction', 'leave_offset')),
  status public.undertime_status NOT NULL DEFAULT 'pending_supervisor',
  supervisor_acted_at timestamptz,
  hr_acted_at timestamptz,
  hr_reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on (tenant_id, employee_id, work_date) for active requests
CREATE UNIQUE INDEX IF NOT EXISTS uq_undertime_requests_active_per_day
  ON public.undertime_requests (tenant_id, employee_id, work_date)
  WHERE status IN ('pending_supervisor', 'pending_hr', 'approved');

CREATE INDEX IF NOT EXISTS idx_undertime_requests_employee_date
  ON public.undertime_requests (employee_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_undertime_requests_approver_status
  ON public.undertime_requests (approver_id, status);

CREATE INDEX IF NOT EXISTS idx_undertime_requests_tenant_status
  ON public.undertime_requests (tenant_id, status, created_at DESC);

-- 4. Row-Level Security (RLS)
ALTER TABLE public.undertime_requests ENABLE ROW LEVEL SECURITY;

-- Employee: SELECT own rows
DROP POLICY IF EXISTS "undertime_requests_employee_select" ON public.undertime_requests;
CREATE POLICY "undertime_requests_employee_select"
ON public.undertime_requests
FOR SELECT
USING (
  employee_id = public.current_employee_id()
);

-- Employee: INSERT own rows (starts at pending_supervisor, or pending_hr if reports_to IS NULL)
DROP POLICY IF EXISTS "undertime_requests_employee_insert" ON public.undertime_requests;
CREATE POLICY "undertime_requests_employee_insert"
ON public.undertime_requests
FOR INSERT
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status IN ('pending_supervisor', 'pending_hr')
);

-- Employee: UPDATE own rows to 'cancelled' ONLY while 'pending_supervisor'
DROP POLICY IF EXISTS "undertime_requests_employee_cancel" ON public.undertime_requests;
CREATE POLICY "undertime_requests_employee_cancel"
ON public.undertime_requests
FOR UPDATE
USING (
  employee_id = public.current_employee_id()
  AND status = 'pending_supervisor'
)
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status = 'cancelled'
);

-- Immediate Supervisor: SELECT direct reports' rows while pending_supervisor (or acted upon)
DROP POLICY IF EXISTS "undertime_requests_supervisor_select" ON public.undertime_requests;
CREATE POLICY "undertime_requests_supervisor_select"
ON public.undertime_requests
FOR SELECT
USING (
  approver_id = public.current_employee_id()
  OR public.is_direct_supervisor(employee_id)
);

-- Immediate Supervisor: UPDATE direct reports' rows while status = 'pending_supervisor'
DROP POLICY IF EXISTS "undertime_requests_supervisor_update" ON public.undertime_requests;
CREATE POLICY "undertime_requests_supervisor_update"
ON public.undertime_requests
FOR UPDATE
USING (
  (
    approver_id = public.current_employee_id()
    OR public.is_direct_supervisor(employee_id)
  )
  AND status = 'pending_supervisor'
)
WITH CHECK (
  (
    approver_id = public.current_employee_id()
    OR public.is_direct_supervisor(employee_id)
  )
  AND status IN ('pending_hr', 'rejected')
);

-- HR Admin & Payroll Officer: SELECT all tenant rows
DROP POLICY IF EXISTS "undertime_requests_hr_select" ON public.undertime_requests;
CREATE POLICY "undertime_requests_hr_select"
ON public.undertime_requests
FOR SELECT
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist', 'payroll_officer'])
);

-- HR Admin: UPDATE rows in 'pending_hr' to 'approved' or 'rejected'
DROP POLICY IF EXISTS "undertime_requests_hr_update" ON public.undertime_requests;
CREATE POLICY "undertime_requests_hr_update"
ON public.undertime_requests
FOR UPDATE
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
  AND status = 'pending_hr'
)
WITH CHECK (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
  AND status IN ('approved', 'rejected')
);

NOTIFY pgrst, 'reload schema';

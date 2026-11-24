-- ============================================================================
-- Temporary Supervisor / HR Work Mode Overrides (Today / Specific Date)
-- Does not mutate permanent contract work_mode on public.employees
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_work_mode_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  override_mode text NOT NULL CHECK (override_mode IN ('onsite', 'wfh')),
  reason text NOT NULL,
  approved_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_work_mode_overrides_emp_date
  ON public.employee_work_mode_overrides (employee_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_employee_work_mode_overrides_tenant_date
  ON public.employee_work_mode_overrides (tenant_id, effective_date);

ALTER TABLE public.employee_work_mode_overrides ENABLE ROW LEVEL SECURITY;

-- Employees can view their own overrides
DROP POLICY IF EXISTS "Employees can view own work mode overrides" ON public.employee_work_mode_overrides;
CREATE POLICY "Employees can view own work mode overrides"
ON public.employee_work_mode_overrides
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_work_mode_overrides.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- Supervisors can view, insert, and update overrides for their active direct reports
DROP POLICY IF EXISTS "Supervisors can manage direct report work mode overrides" ON public.employee_work_mode_overrides;
CREATE POLICY "Supervisors can manage direct report work mode overrides"
ON public.employee_work_mode_overrides
FOR ALL
USING (
  public.is_direct_supervisor(employee_id)
)
WITH CHECK (
  public.is_direct_supervisor(employee_id)
);

-- HR can view all overrides in their tenant
DROP POLICY IF EXISTS "HR can view tenant work mode overrides" ON public.employee_work_mode_overrides;
CREATE POLICY "HR can view tenant work mode overrides"
ON public.employee_work_mode_overrides
FOR SELECT
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist', 'payroll_officer'])
);

-- HR Admin & Generalist can insert/update overrides in their tenant
DROP POLICY IF EXISTS "HR can manage tenant work mode overrides" ON public.employee_work_mode_overrides;
CREATE POLICY "HR can manage tenant work mode overrides"
ON public.employee_work_mode_overrides
FOR ALL
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
)
WITH CHECK (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
);

NOTIFY pgrst, 'reload schema';

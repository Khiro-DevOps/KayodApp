-- ============================================================
-- MIGRATION: Attendance Correction Requests (G2)
-- File: 20261124_attendance_correction_requests.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_log_id uuid REFERENCES public.attendance_logs(id) ON DELETE SET NULL,
  target_date date NOT NULL,
  correction_type text NOT NULL,
  original_clock_in timestamptz,
  original_clock_out timestamptz,
  requested_clock_in timestamptz NOT NULL,
  requested_clock_out timestamptz,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_correction_requests_employee_date
  ON public.attendance_correction_requests (employee_id, target_date);

CREATE INDEX IF NOT EXISTS idx_attendance_correction_requests_status_created
  ON public.attendance_correction_requests (status, created_at DESC);

ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;

-- Employee self-select
DROP POLICY IF EXISTS "attendance_correction_requests_employee_select" ON public.attendance_correction_requests;
CREATE POLICY "attendance_correction_requests_employee_select" ON public.attendance_correction_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_correction_requests.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- Employee self-insert
DROP POLICY IF EXISTS "attendance_correction_requests_employee_insert" ON public.attendance_correction_requests;
CREATE POLICY "attendance_correction_requests_employee_insert" ON public.attendance_correction_requests
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_correction_requests.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- HR/Admin full access within tenant
DROP POLICY IF EXISTS "attendance_correction_requests_hr_all" ON public.attendance_correction_requests;
CREATE POLICY "attendance_correction_requests_hr_all" ON public.attendance_correction_requests
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = attendance_correction_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = attendance_correction_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

NOTIFY pgrst, 'reload schema';

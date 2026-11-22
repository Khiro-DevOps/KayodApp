-- ============================================================
-- MIGRATION: Overtime Requests & Leave/Rest-Day Guardrails (OT1)
-- File: 20261125_overtime_requests_and_guardrails.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee_date_status
  ON public.overtime_requests (employee_id, work_date, status);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_status_created
  ON public.overtime_requests (status, created_at DESC);

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS overtime_request_id uuid REFERENCES public.overtime_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outside_approved_window boolean NOT NULL DEFAULT false;

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- Employees can SELECT their own rows
DROP POLICY IF EXISTS "overtime_requests_employee_select" ON public.overtime_requests;
CREATE POLICY "overtime_requests_employee_select" ON public.overtime_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = overtime_requests.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- Employees can INSERT only their own rows with status = 'pending' and reviewed_by IS NULL
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
  AND status = 'pending'
  AND reviewed_by IS NULL
);

-- Employees can UPDATE their own row ONLY to cancel while pending or unused approved
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
    status = 'pending'
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

-- HR/Admin can SELECT, INSERT, UPDATE across their tenant
DROP POLICY IF EXISTS "overtime_requests_hr_select" ON public.overtime_requests;
CREATE POLICY "overtime_requests_hr_select" ON public.overtime_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = overtime_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

DROP POLICY IF EXISTS "overtime_requests_hr_insert" ON public.overtime_requests;
CREATE POLICY "overtime_requests_hr_insert" ON public.overtime_requests
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = overtime_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

DROP POLICY IF EXISTS "overtime_requests_hr_update" ON public.overtime_requests;
CREATE POLICY "overtime_requests_hr_update" ON public.overtime_requests
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = overtime_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = overtime_requests.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

-- Atomic trigger on attendance_logs to verify & consume approved overtime_request_id
CREATE OR REPLACE FUNCTION public.verify_and_consume_overtime_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ot public.overtime_requests%ROWTYPE;
BEGIN
  IF NEW.overtime_request_id IS NOT NULL THEN
    SELECT *
    INTO v_ot
    FROM public.overtime_requests
    WHERE id = NEW.overtime_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Overtime request not found.';
    END IF;

    IF v_ot.employee_id <> NEW.employee_id THEN
      RAISE EXCEPTION 'Overtime request does not belong to this employee.';
    END IF;

    IF v_ot.status <> 'approved' THEN
      RAISE EXCEPTION 'Overtime request must be approved before clocking in.';
    END IF;

    IF v_ot.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'Overtime request has already been used.';
    END IF;

    IF v_ot.work_date <> (COALESCE(NEW.clock_in, now()) AT TIME ZONE 'Asia/Manila')::date THEN
      RAISE EXCEPTION 'Overtime request work_date does not match Asia/Manila clock-in date.';
    END IF;

    UPDATE public.overtime_requests
    SET used_at = now()
    WHERE id = NEW.overtime_request_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_and_consume_overtime_request ON public.attendance_logs;
CREATE TRIGGER trg_verify_and_consume_overtime_request
  BEFORE INSERT ON public.attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.verify_and_consume_overtime_request();

NOTIFY pgrst, 'reload schema';

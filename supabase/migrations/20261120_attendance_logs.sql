-- ============================================================
-- MIGRATION: Attendance Logs & Employee Remote Residences (A1)
-- File: 20261120_attendance_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  clock_in timestamptz,
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  total_break_minutes integer NOT NULL DEFAULT 0,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  clock_out_accuracy_meters double precision,
  distance_meters integer,
  total_hours numeric(6,2),
  zone_status text NOT NULL DEFAULT 'in_zone',
  location_used text,
  verification_type text,
  work_mode text,
  break_status text,
  status text NOT NULL DEFAULT 'present',
  is_late boolean NOT NULL DEFAULT false,
  late_minutes integer NOT NULL DEFAULT 0,
  flag_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_date
  ON public.attendance_logs (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant_date
  ON public.attendance_logs (tenant_id, date);

CREATE TABLE IF NOT EXISTS public.employee_remote_residences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 200,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_remote_residences ENABLE ROW LEVEL SECURITY;

-- Attendance logs: Employee self-access
DROP POLICY IF EXISTS "attendance_logs_employee_select" ON public.attendance_logs;
CREATE POLICY "attendance_logs_employee_select" ON public.attendance_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_logs.employee_id
      AND e.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_logs_employee_insert" ON public.attendance_logs;
CREATE POLICY "attendance_logs_employee_insert" ON public.attendance_logs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_logs.employee_id
      AND e.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attendance_logs_employee_update" ON public.attendance_logs;
CREATE POLICY "attendance_logs_employee_update" ON public.attendance_logs
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_logs.employee_id
      AND e.profile_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = attendance_logs.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- Attendance logs: HR management within tenant
DROP POLICY IF EXISTS "attendance_logs_hr_all" ON public.attendance_logs;
CREATE POLICY "attendance_logs_hr_all" ON public.attendance_logs
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = attendance_logs.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = attendance_logs.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

-- Employee remote residences: Employee self-access
DROP POLICY IF EXISTS "employee_remote_residences_employee_select" ON public.employee_remote_residences;
CREATE POLICY "employee_remote_residences_employee_select" ON public.employee_remote_residences
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_remote_residences.employee_id
      AND e.profile_id = auth.uid()
  )
);

-- Employee remote residences: HR management within tenant
DROP POLICY IF EXISTS "employee_remote_residences_hr_all" ON public.employee_remote_residences;
CREATE POLICY "employee_remote_residences_hr_all" ON public.employee_remote_residences
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = employee_remote_residences.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.employees e ON e.id = employee_remote_residences.employee_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND (actor.tenant_id IS NULL OR e.tenant_id IS NULL OR actor.tenant_id = e.tenant_id)
  )
);

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS accuracy_meters double precision,
  ADD COLUMN IF NOT EXISTS clock_out_accuracy_meters double precision,
  ADD COLUMN IF NOT EXISTS distance_meters integer,
  ADD COLUMN IF NOT EXISTS total_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS zone_status text NOT NULL DEFAULT 'in_zone',
  ADD COLUMN IF NOT EXISTS location_used text,
  ADD COLUMN IF NOT EXISTS verification_type text,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS break_status text,
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS lunch_start timestamptz,
  ADD COLUMN IF NOT EXISTS lunch_end timestamptz,
  ADD COLUMN IF NOT EXISTS total_lunch_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS short_breaks_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overbreak_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_break_type text,
  ADD COLUMN IF NOT EXISTS break_log jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- PHASE 3 Feature #5: Incident Report (IR) & Notice to Explain (NTE)
-- Philippine Labor Code Twin-Notice Due Process
-- File: supabase/migrations/20261206_phase3_incident_reports_nte.sql
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Enums
DO $$
BEGIN
  CREATE TYPE public.incident_status AS ENUM (
    'draft',
    'nte_issued',
    'explanation_submitted',
    'under_review',
    'resolved',
    'dismissed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.disciplinary_sanction AS ENUM (
    'none',
    'verbal_warning',
    'written_warning',
    'final_written_warning',
    'suspension',
    'termination'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure helper current_employee_id() exists
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

-- 3. Table: public.incident_reports
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_number text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id),
  incident_date date NOT NULL,
  offense_category text NOT NULL CHECK (
    offense_category IN (
      'Attendance / Tardiness',
      'Policy Violation',
      'Insubordination',
      'Negligence / Quality',
      'Code of Conduct',
      'Other'
    )
  ),
  policy_violated text,
  description text NOT NULL,
  evidence_paths text[] NOT NULL DEFAULT '{}',
  status public.incident_status NOT NULL DEFAULT 'draft',

  -- First Notice (NTE)
  nte_issued_at timestamptz,
  nte_issued_by uuid REFERENCES auth.users(id),
  nte_deadline_at timestamptz,
  nte_document_path text,

  -- Employee Written Explanation
  employee_explanation text,
  explanation_submitted_at timestamptz,
  explanation_attachments text[] NOT NULL DEFAULT '{}',

  -- Second Notice (Resolution / Notice of Decision)
  sanction_type public.disciplinary_sanction,
  suspension_days int CHECK (suspension_days IS NULL OR (suspension_days >= 1 AND suspension_days <= 30)),
  suspension_start_date date,
  suspension_end_date date,
  resolution_notes text,
  decision_document_path text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_incident_reports_tenant_case_number UNIQUE (tenant_id, case_number),
  CONSTRAINT chk_incident_reports_nte_deadline CHECK (
    nte_deadline_at IS NULL
    OR nte_issued_at IS NULL
    OR nte_deadline_at >= nte_issued_at + interval '5 days'
  )
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_tenant_status
  ON public.incident_reports (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_reports_employee_status
  ON public.incident_reports (employee_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_reports_reported_by
  ON public.incident_reports (reported_by, created_at DESC);

-- 4. Sequential Case Number Generator per Tenant (IR-YYYY-XXXX)
CREATE OR REPLACE FUNCTION public.assign_incident_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_prefix text;
  v_next_seq int;
BEGIN
  IF NEW.case_number IS NOT NULL AND btrim(NEW.case_number) <> '' THEN
    RETURN NEW;
  END IF;

  v_year := to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila', 'YYYY');
  v_prefix := 'IR-' || v_year || '-';

  -- Advisory lock scoped to tenant + year to prevent duplicate case numbers under concurrency
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || ':' || v_year));

  SELECT COALESCE(
    MAX(
      CASE
        WHEN case_number LIKE v_prefix || '%'
          AND substring(case_number from length(v_prefix) + 1) ~ '^[0-9]+$'
        THEN substring(case_number from length(v_prefix) + 1)::int
        ELSE 0
      END
    ),
    0
  ) + 1
  INTO v_next_seq
  FROM public.incident_reports
  WHERE tenant_id = NEW.tenant_id;

  NEW.case_number := v_prefix || lpad(v_next_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_reports_assign_case_number ON public.incident_reports;
CREATE TRIGGER trg_incident_reports_assign_case_number
  BEFORE INSERT ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_incident_case_number();

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_incident_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_reports_updated_at ON public.incident_reports;
CREATE TRIGGER trg_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_incident_reports_updated_at();

-- 6. Guard employee updates so target employees cannot modify NTE/sanction/reporter fields
CREATE OR REPLACE FUNCTION public.guard_incident_report_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HR Admin / HR Generalist have full update authority
  IF public.has_hr_role(OLD.tenant_id, ARRAY['hr_admin', 'hr_generalist']) THEN
    RETURN NEW;
  END IF;

  -- Otherwise, only the target employee transitioning nte_issued -> explanation_submitted
  IF OLD.employee_id = public.current_employee_id() THEN
    IF OLD.status <> 'nte_issued' OR NEW.status <> 'explanation_submitted' THEN
      RAISE EXCEPTION 'Employees may only submit a written explanation while NTE is issued.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.case_number IS DISTINCT FROM OLD.case_number
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.reported_by IS DISTINCT FROM OLD.reported_by
      OR NEW.incident_date IS DISTINCT FROM OLD.incident_date
      OR NEW.offense_category IS DISTINCT FROM OLD.offense_category
      OR NEW.policy_violated IS DISTINCT FROM OLD.policy_violated
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.evidence_paths IS DISTINCT FROM OLD.evidence_paths
      OR NEW.nte_issued_at IS DISTINCT FROM OLD.nte_issued_at
      OR NEW.nte_issued_by IS DISTINCT FROM OLD.nte_issued_by
      OR NEW.nte_deadline_at IS DISTINCT FROM OLD.nte_deadline_at
      OR NEW.nte_document_path IS DISTINCT FROM OLD.nte_document_path
      OR NEW.sanction_type IS DISTINCT FROM OLD.sanction_type
      OR NEW.suspension_days IS DISTINCT FROM OLD.suspension_days
      OR NEW.suspension_start_date IS DISTINCT FROM OLD.suspension_start_date
      OR NEW.suspension_end_date IS DISTINCT FROM OLD.suspension_end_date
      OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
      OR NEW.decision_document_path IS DISTINCT FROM OLD.decision_document_path
      OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
    THEN
      RAISE EXCEPTION 'Employees may only update their written explanation and attachments.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_reports_guard_employee_update ON public.incident_reports;
CREATE TRIGGER trg_incident_reports_guard_employee_update
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_incident_report_employee_update();

-- 7. Private Storage Bucket: disciplinary-docs
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('disciplinary-docs', 'disciplinary-docs', false, 15728640)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = COALESCE(storage.buckets.file_size_limit, 15728640);

-- 8. Row-Level Security (RLS)
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- HR Admin & HR Generalist: SELECT, INSERT, UPDATE within tenant_id
-- Recruiter & Payroll Officer have ZERO access
DROP POLICY IF EXISTS "incident_reports_hr_select" ON public.incident_reports;
CREATE POLICY "incident_reports_hr_select"
ON public.incident_reports
FOR SELECT
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
);

DROP POLICY IF EXISTS "incident_reports_hr_insert" ON public.incident_reports;
CREATE POLICY "incident_reports_hr_insert"
ON public.incident_reports
FOR INSERT
WITH CHECK (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
);

DROP POLICY IF EXISTS "incident_reports_hr_update" ON public.incident_reports;
CREATE POLICY "incident_reports_hr_update"
ON public.incident_reports
FOR UPDATE
USING (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
)
WITH CHECK (
  public.has_hr_role(tenant_id, ARRAY['hr_admin', 'hr_generalist'])
);

-- Direct Supervisor / Reporter: INSERT as 'draft' for direct reports & SELECT own submitted reports
DROP POLICY IF EXISTS "incident_reports_supervisor_insert" ON public.incident_reports;
CREATE POLICY "incident_reports_supervisor_insert"
ON public.incident_reports
FOR INSERT
WITH CHECK (
  reported_by = auth.uid()
  AND status = 'draft'
  AND public.is_direct_supervisor(employee_id)
);

DROP POLICY IF EXISTS "incident_reports_reporter_select" ON public.incident_reports;
CREATE POLICY "incident_reports_reporter_select"
ON public.incident_reports
FOR SELECT
USING (
  reported_by = auth.uid()
);

-- Target Employee: SELECT only when status <> 'draft'
DROP POLICY IF EXISTS "incident_reports_employee_select" ON public.incident_reports;
CREATE POLICY "incident_reports_employee_select"
ON public.incident_reports
FOR SELECT
USING (
  employee_id = public.current_employee_id()
  AND status <> 'draft'
);

-- Target Employee: UPDATE only from 'nte_issued' -> 'explanation_submitted'
DROP POLICY IF EXISTS "incident_reports_employee_update" ON public.incident_reports;
CREATE POLICY "incident_reports_employee_update"
ON public.incident_reports
FOR UPDATE
USING (
  employee_id = public.current_employee_id()
  AND status = 'nte_issued'
)
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status = 'explanation_submitted'
);

NOTIFY pgrst, 'reload schema';

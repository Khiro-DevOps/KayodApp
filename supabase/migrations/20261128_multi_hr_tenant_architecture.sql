-- =============================================================================
-- Migration: 20261128_multi_hr_tenant_architecture.sql
-- Purpose:
--   2.1 Schema:
--     - profiles.is_tenant_owner boolean NOT NULL DEFAULT false (set true for
--       earliest-created hr_manager of SG Engineering tenant).
--     - tenant_invites table + partial unique index for pending invites.
--     - (tenant_id, created_at DESC) indexes on tenant-scoped tables.
--   2.2 Security helpers + RLS:
--     - Backfill auth.users.email_confirmed_at for existing demo accounts so
--       email_confirmed_at gate does not blank out demo data.
--     - current_tenant_id(), current_user_is_owner(), current_user_is_hr_manager()
--       all SECURITY DEFINER, STABLE, SET search_path = public.
--     - Dynamically drop old permissive policies on target tenant-scoped tables
--       and create explicit tenant-scoped HR policies + self-scoped applicant/
--       employee policies + public published job/tenant branding policies.
--     - Column-level UPDATE grant on public.profiles + REVOKE INSERT/DELETE
--       from anon/authenticated to block self-escalation without self-query recursion.
--     - tenant_team_names view (HR-only within caller's tenant).
--     - sync_child_tenant_id() trigger enforcing parent-child tenant_id match.
--   2.3 Atomic onboarding RPCs:
--     - create_tenant_for_hr(...)
--     - accept_hr_invite(...)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 2.0 Backfill auth.users.email_confirmed_at for existing demo users
-- ---------------------------------------------------------------------------
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, created_at, now())
WHERE email_confirmed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2.1 Schema: profiles.is_tenant_owner + tenant_invites + indexes
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_tenant_owner boolean NOT NULL DEFAULT false;

-- Ensure all safe self-updatable profile columns exist before column-level GRANT
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS work_setup text,
  ADD COLUMN IF NOT EXISTS work_location_id uuid,
  ADD COLUMN IF NOT EXISTS city_id uuid,
  ADD COLUMN IF NOT EXISTS province_id uuid,
  ADD COLUMN IF NOT EXISTS email_notifications boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_notifications boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Set is_tenant_owner = true for the earliest-created HR manager of each tenant
-- (including the canonical SG Engineering tenant) if no owner is marked yet.
WITH ranked_hr AS (
  SELECT
    p.id,
    p.tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.tenant_id
      ORDER BY p.created_at ASC NULLS LAST, p.id ASC
    ) AS rn
  FROM public.profiles p
  WHERE p.tenant_id IS NOT NULL
    AND p.role::text IN ('hr_manager', 'hr', 'admin')
)
UPDATE public.profiles p
SET is_tenant_owner = true
FROM ranked_hr r
WHERE p.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles existing_owner
    WHERE existing_owner.tenant_id = r.tenant_id
      AND existing_owner.is_tenant_owner = true
  );

-- Create tenant_invites table
CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invites_lowercase_email_chk CHECK (invited_email = lower(btrim(invited_email)))
);

-- If tenant_invites already existed from an older schema, ensure required columns/constraints exist
ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_token_hash_key
  ON public.tenant_invites (token_hash);

-- Partial unique index: one pending invite per (tenant_id, invited_email) where accepted_at IS NULL
DROP INDEX IF EXISTS public.idx_tenant_invites_one_pending_per_email;
CREATE UNIQUE INDEX idx_tenant_invites_one_pending_per_email
  ON public.tenant_invites (tenant_id, lower(invited_email))
  WHERE accepted_at IS NULL;

-- Index (tenant_id, created_at DESC) on each tenant-scoped table that has created_at
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_created_at
  ON public.profiles (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_tenant_created_at
  ON public.job_postings (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_created_at
  ON public.job_applications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_created_at
  ON public.applications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_schedules_tenant_created_at
  ON public.interview_schedules (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_offers_tenant_created_at
  ON public.job_offers (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_created_at
  ON public.employees (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_branches_tenant_created_at
  ON public.office_branches (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant_created_at
  ON public.attendance_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_tenant_created_at
  ON public.overtime_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_correction_requests_tenant_created_at
  ON public.attendance_correction_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_created_at
  ON public.payslips (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant_created_at
  ON public.tenant_invites (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2.2 Security helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.is_tenant_owner, false)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_hr_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND p.role::text IN ('hr_manager', 'hr', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_owner() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_hr_manager() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Narrow view: tenant_team_names (id, first_name, last_name)
-- Restricted to HR managers in the caller's tenant so cross-user profile
-- fields are never exposed and employees/candidates cannot enumerate HR names.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.tenant_team_names AS
SELECT
  p.id,
  p.tenant_id,
  p.first_name,
  p.last_name
FROM public.profiles p
WHERE p.tenant_id = (SELECT public.current_tenant_id())
  AND (SELECT public.current_user_is_hr_manager())
  AND p.role::text IN ('hr_manager', 'hr', 'admin');

GRANT SELECT ON public.tenant_team_names TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Parent-child tenant_id enforcement trigger function
-- Enforces that NEW.tenant_id matches parent row's tenant_id on INSERT/UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_child_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_tenant_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'job_applications' THEN
    IF NEW.job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = NEW.job_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'applications' THEN
    IF NEW.job_posting_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = NEW.job_posting_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'interview_schedules' THEN
    IF NEW.job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = NEW.job_id;
    END IF;
    IF v_parent_tenant_id IS NULL AND NEW.application_id IS NOT NULL THEN
      SELECT ja.tenant_id INTO v_parent_tenant_id
      FROM public.job_applications ja
      WHERE ja.id = NEW.application_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'job_offers' THEN
    IF NEW.job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = NEW.job_id;
    END IF;
    IF v_parent_tenant_id IS NULL AND NEW.application_id IS NOT NULL THEN
      SELECT ja.tenant_id INTO v_parent_tenant_id
      FROM public.job_applications ja
      WHERE ja.id = NEW.application_id;
      IF v_parent_tenant_id IS NULL THEN
        SELECT a.tenant_id INTO v_parent_tenant_id
        FROM public.applications a
        WHERE a.id = NEW.application_id;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('attendance_logs', 'overtime_requests', 'attendance_correction_requests', 'payslips') THEN
    IF NEW.employee_id IS NOT NULL THEN
      SELECT e.tenant_id INTO v_parent_tenant_id
      FROM public.employees e
      WHERE e.id = NEW.employee_id;
    END IF;
  END IF;

  IF v_parent_tenant_id IS NOT NULL THEN
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_parent_tenant_id THEN
      RAISE EXCEPTION 'Child row tenant_id (%) does not match parent tenant_id (%) on %',
        NEW.tenant_id, v_parent_tenant_id, TG_TABLE_NAME;
    END IF;
    NEW.tenant_id := v_parent_tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_id_job_applications ON public.job_applications;
CREATE TRIGGER trg_sync_tenant_id_job_applications
  BEFORE INSERT OR UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_applications ON public.applications;
CREATE TRIGGER trg_sync_tenant_id_applications
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_interview_schedules ON public.interview_schedules;
CREATE TRIGGER trg_sync_tenant_id_interview_schedules
  BEFORE INSERT OR UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_job_offers ON public.job_offers;
CREATE TRIGGER trg_sync_tenant_id_job_offers
  BEFORE INSERT OR UPDATE ON public.job_offers
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_attendance_logs ON public.attendance_logs;
CREATE TRIGGER trg_sync_tenant_id_attendance_logs
  BEFORE INSERT OR UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_overtime_requests ON public.overtime_requests;
CREATE TRIGGER trg_sync_tenant_id_overtime_requests
  BEFORE INSERT OR UPDATE ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_attendance_correction_requests ON public.attendance_correction_requests;
CREATE TRIGGER trg_sync_tenant_id_attendance_correction_requests
  BEFORE INSERT OR UPDATE ON public.attendance_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

DROP TRIGGER IF EXISTS trg_sync_tenant_id_payslips ON public.payslips;
CREATE TRIGGER trg_sync_tenant_id_payslips
  BEFORE INSERT OR UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id();

-- ---------------------------------------------------------------------------
-- Lock down direct client INSERT/UPDATE/DELETE on public.profiles
-- Profiles are created by the SECURITY DEFINER auth trigger or admin server
-- actions. Authenticated users can only UPDATE non-sensitive profile columns
-- on their own row (role, tenant_id, is_tenant_owner are not in the column grant).
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  first_name,
  last_name,
  phone,
  avatar,
  avatar_url,
  date_of_birth,
  address,
  city,
  country,
  work_setup,
  work_location_id,
  city_id,
  province_id,
  email_notifications,
  push_notifications,
  updated_at
) ON TABLE public.profiles TO authenticated;

-- Lock down direct client access on public.tenant_invites (server action only)
REVOKE ALL ON TABLE public.tenant_invites FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS and drop all pre-existing policies on target tables so no old
-- broad permissive policies remain to defeat tenant isolation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_pol record;
  v_tables text[] := ARRAY[
    'tenants',
    'profiles',
    'tenant_invites',
    'job_postings',
    'job_applications',
    'applications',
    'interview_schedules',
    'job_offers',
    'employees',
    'office_branches',
    'attendance_logs',
    'overtime_requests',
    'attendance_correction_requests',
    'payslips',
    'payroll_periods'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      FOR v_pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = v_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- 1) tenants policies
-- Authenticated tenant members (HR, employees) can read their own tenant row
CREATE POLICY "tenants_member_select"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id = (SELECT public.current_tenant_id()));

-- Anon and authenticated visitors can read tenants that have published jobs (preserves job board company branding)
CREATE POLICY "tenants_published_job_select"
  ON public.tenants
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_postings jp
      WHERE jp.tenant_id = tenants.id
        AND jp.is_published = true
    )
  );

-- Only tenant owner HR manager can update tenant row
CREATE POLICY "tenants_owner_update"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
    AND (SELECT public.current_user_is_owner())
  )
  WITH CHECK (
    id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
    AND (SELECT public.current_user_is_owner())
  );

-- 2) profiles policies (own row OR applicant of a job in caller's HR tenant)
CREATE POLICY "profiles_select_own_or_tenant_applicant"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      (SELECT public.current_user_is_hr_manager())
      AND (
        EXISTS (
          SELECT 1
          FROM public.job_applications ja
          JOIN public.job_postings jp ON jp.id = ja.job_id
          WHERE ja.applicant_id = profiles.id
            AND jp.tenant_id = (SELECT public.current_tenant_id())
        )
        OR EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.job_postings jp ON jp.id = a.job_posting_id
          WHERE a.candidate_id = profiles.id
            AND jp.tenant_id = (SELECT public.current_tenant_id())
        )
        OR EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.profile_id = profiles.id
            AND e.tenant_id = (SELECT public.current_tenant_id())
        )
      )
    )
  );

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 3) tenant_invites policies (tenant owner HR only; raw token never exposed)
CREATE POLICY "tenant_invites_owner_all"
  ON public.tenant_invites
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
    AND (SELECT public.current_user_is_owner())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
    AND (SELECT public.current_user_is_owner())
  );

-- 4) job_postings policies
CREATE POLICY "jobs_select_published_or_tenant_hr"
  ON public.job_postings
  FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    OR (
      tenant_id = (SELECT public.current_tenant_id())
      AND (SELECT public.current_user_is_hr_manager())
    )
  );

CREATE POLICY "jobs_hr_insert"
  ON public.job_postings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "jobs_hr_update"
  ON public.job_postings
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "jobs_hr_delete"
  ON public.job_postings
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

-- 5) job_applications policies (HR in tenant + applicant own rows)
CREATE POLICY "job_applications_hr_all"
  ON public.job_applications
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "job_applications_candidate_select"
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (applicant_id = auth.uid());

CREATE POLICY "job_applications_candidate_insert"
  ON public.job_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = auth.uid());

CREATE POLICY "job_applications_candidate_update"
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (applicant_id = auth.uid())
  WITH CHECK (applicant_id = auth.uid());

-- 6) applications policies (HR in tenant + candidate own rows)
CREATE POLICY "applications_hr_all"
  ON public.applications
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "applications_candidate_select"
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (candidate_id = auth.uid());

CREATE POLICY "applications_candidate_insert"
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (candidate_id = auth.uid());

CREATE POLICY "applications_candidate_update"
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (candidate_id = auth.uid())
  WITH CHECK (candidate_id = auth.uid());

-- 7) interview_schedules policies (HR in tenant + applicant own rows)
CREATE POLICY "interview_schedules_hr_all"
  ON public.interview_schedules
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "interview_schedules_applicant_select"
  ON public.interview_schedules
  FOR SELECT
  TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.job_applications ja
      WHERE ja.id = interview_schedules.application_id
        AND ja.applicant_id = auth.uid()
    )
  );

CREATE POLICY "interview_schedules_applicant_update"
  ON public.interview_schedules
  FOR UPDATE
  TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.job_applications ja
      WHERE ja.id = interview_schedules.application_id
        AND ja.applicant_id = auth.uid()
    )
  )
  WITH CHECK (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.job_applications ja
      WHERE ja.id = interview_schedules.application_id
        AND ja.applicant_id = auth.uid()
    )
  );

-- 8) job_offers policies (HR in tenant + candidate own non-DRAFT offers)
CREATE POLICY "job_offers_hr_all"
  ON public.job_offers
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "job_offers_candidate_select"
  ON public.job_offers
  FOR SELECT
  TO authenticated
  USING (
    status <> 'DRAFT'
    AND (
      EXISTS (
        SELECT 1
        FROM public.applications a
        WHERE a.id = job_offers.application_id
          AND a.candidate_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.job_applications ja
        WHERE ja.id = job_offers.application_id
          AND ja.applicant_id = auth.uid()
      )
    )
  );

CREATE POLICY "job_offers_candidate_update"
  ON public.job_offers
  FOR UPDATE
  TO authenticated
  USING (
    status IN ('SENT', 'REVISED')
    AND (
      EXISTS (
        SELECT 1
        FROM public.applications a
        WHERE a.id = job_offers.application_id
          AND a.candidate_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.job_applications ja
        WHERE ja.id = job_offers.application_id
          AND ja.applicant_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    status IN ('NEGOTIATION_PENDING', 'ACCEPTED', 'DECLINED')
  );

-- 9) employees policies (HR in tenant + employee own row)
CREATE POLICY "employees_hr_all"
  ON public.employees
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "employees_self_select"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- 10) office_branches policies (HR manage in tenant; tenant members, interview applicants, and published job viewers can SELECT)
CREATE POLICY "office_branches_hr_all"
  ON public.office_branches
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "office_branches_member_or_interview_select"
  ON public.office_branches
  FOR SELECT
  TO anon, authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM public.interview_schedules s
      WHERE s.office_branch_id = office_branches.id
        AND (
          s.applicant_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.job_applications ja
            WHERE ja.id = s.application_id
              AND ja.applicant_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.job_postings jp
      WHERE jp.work_location_id = office_branches.id
        AND jp.is_published = true
    )
  );

-- 11) attendance_logs policies (HR in tenant + employee own rows for clock-in/out)
CREATE POLICY "attendance_logs_hr_all"
  ON public.attendance_logs
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "attendance_logs_employee_select"
  ON public.attendance_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_logs.employee_id
        AND e.profile_id = auth.uid()
    )
  );

CREATE POLICY "attendance_logs_employee_insert"
  ON public.attendance_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_logs.employee_id
        AND e.profile_id = auth.uid()
    )
  );

CREATE POLICY "attendance_logs_employee_update"
  ON public.attendance_logs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_logs.employee_id
        AND e.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_logs.employee_id
        AND e.profile_id = auth.uid()
    )
  );

-- 12) overtime_requests policies (HR in tenant + employee own rows)
CREATE POLICY "overtime_requests_hr_all"
  ON public.overtime_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "overtime_requests_employee_select"
  ON public.overtime_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = overtime_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  );

CREATE POLICY "overtime_requests_employee_insert"
  ON public.overtime_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = overtime_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  );

CREATE POLICY "overtime_requests_employee_update"
  ON public.overtime_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = overtime_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = overtime_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  );

-- 13) attendance_correction_requests policies (HR in tenant + employee own rows)
CREATE POLICY "attendance_correction_requests_hr_all"
  ON public.attendance_correction_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "attendance_correction_requests_employee_select"
  ON public.attendance_correction_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_correction_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  );

CREATE POLICY "attendance_correction_requests_employee_insert"
  ON public.attendance_correction_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_correction_requests.employee_id
        AND e.profile_id = auth.uid()
    )
  );

-- 14) payslips policies (HR in tenant + employee own payslips)
CREATE POLICY "payslips_hr_all"
  ON public.payslips
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

CREATE POLICY "payslips_employee_select"
  ON public.payslips
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = payslips.employee_id
        AND e.profile_id = auth.uid()
    )
  );

-- 15) payroll_periods policies (if table exists: HR in tenant + employee with payslip in period)
DO $$
BEGIN
  IF to_regclass('public.payroll_periods') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY "payroll_periods_hr_all"
        ON public.payroll_periods
        FOR ALL
        TO authenticated
        USING (
          tenant_id = (SELECT public.current_tenant_id())
          AND (SELECT public.current_user_is_hr_manager())
        )
        WITH CHECK (
          tenant_id = (SELECT public.current_tenant_id())
          AND (SELECT public.current_user_is_hr_manager())
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "payroll_periods_employee_select"
        ON public.payroll_periods
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.payslips ps
            JOIN public.employees e ON e.id = ps.employee_id
            WHERE ps.payroll_period_id = payroll_periods.id
              AND e.profile_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.3 Atomic Onboarding RPCs (service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tenant_for_hr(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_company_name text,
  p_industry text DEFAULT NULL,
  p_company_size text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_plan text DEFAULT 'starter',
  p_logo_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_branch_address text;
  v_plan_expires_at timestamptz := now() + interval '30 days';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required.';
  END IF;

  INSERT INTO public.tenants (
    name,
    industry,
    company_size,
    address,
    logo_url,
    plan,
    plan_expires_at
  )
  VALUES (
    btrim(p_company_name),
    NULLIF(btrim(COALESCE(p_industry, '')), ''),
    NULLIF(btrim(COALESCE(p_company_size, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    p_logo_url,
    COALESCE(NULLIF(btrim(COALESCE(p_plan, '')), ''), 'starter'),
    v_plan_expires_at
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    role,
    tenant_id,
    tenant_name,
    is_tenant_owner,
    address
  )
  VALUES (
    p_user_id,
    lower(btrim(COALESCE(p_email, ''))),
    btrim(COALESCE(p_first_name, '')),
    btrim(COALESCE(p_last_name, '')),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    'hr_manager',
    v_tenant_id,
    btrim(p_company_name),
    true,
    NULLIF(btrim(COALESCE(p_address, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    role = 'hr_manager',
    tenant_id = EXCLUDED.tenant_id,
    tenant_name = EXCLUDED.tenant_name,
    is_tenant_owner = true,
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    updated_at = now();

  v_branch_address := COALESCE(NULLIF(btrim(COALESCE(p_address, '')), ''), 'Cebu City, Philippines');

  IF NOT EXISTS (
    SELECT 1 FROM public.office_branches ob WHERE ob.tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.office_branches (
      tenant_id,
      name,
      address,
      latitude,
      longitude,
      radius_meters,
      is_primary
    )
    VALUES (
      v_tenant_id,
      'Main Office',
      v_branch_address,
      10.3157,
      123.8854,
      200,
      true
    );
  END IF;

  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_hr_invite(
  p_user_id uuid,
  p_token_hash text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_tenant_name text;
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'Invalid invite parameters.';
  END IF;

  SELECT ti.*
  INTO v_invite
  FROM public.tenant_invites ti
  WHERE ti.token_hash = btrim(p_token_hash)
    AND ti.accepted_at IS NULL
    AND ti.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link has expired. Ask your HR Manager for a new link.';
  END IF;

  IF lower(btrim(COALESCE(p_email, ''))) <> lower(btrim(v_invite.invited_email)) THEN
    RAISE EXCEPTION 'Email address does not match the invited email.';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = v_invite.tenant_id;

  UPDATE public.tenant_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    role,
    tenant_id,
    tenant_name,
    is_tenant_owner
  )
  VALUES (
    p_user_id,
    lower(btrim(v_invite.invited_email)),
    btrim(COALESCE(p_first_name, '')),
    btrim(COALESCE(p_last_name, '')),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    'hr_manager',
    v_invite.tenant_id,
    v_tenant_name,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    role = 'hr_manager',
    tenant_id = EXCLUDED.tenant_id,
    tenant_name = EXCLUDED.tenant_name,
    is_tenant_owner = false,
    updated_at = now();

  RETURN v_invite.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_for_hr(uuid, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_hr(uuid, text, text, text, text, text, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.accept_hr_invite(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_hr_invite(uuid, text, text, text, text, text) TO service_role;

COMMIT;

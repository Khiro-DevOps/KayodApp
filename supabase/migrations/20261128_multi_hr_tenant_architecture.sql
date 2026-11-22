-- =============================================================================
-- Migration: 20261128_multi_hr_tenant_architecture.sql
-- Purpose:
--   - Single transaction (BEGIN; ... COMMIT;) so any failure rolls back all changes.
--   - Preflight verification of required tables, referenced columns, and
--     unconfirmed auth.users count.
--   - 2.1 Schema:
--     - profiles.is_tenant_owner boolean NOT NULL DEFAULT false (set true for
--       earliest-created hr_manager of each tenant).
--     - tenant_invites table + partial unique index idx_tenant_invites_one_pending_per_email.
--     - (tenant_id, created_at DESC) indexes on tenant-scoped tables.
--   - 2.2 Security helpers + RLS:
--     - current_tenant_id(), current_user_is_owner(), current_user_is_hr_manager()
--       all SECURITY DEFINER, STABLE, SET search_path = public.
--     - Dynamic column-level UPDATE grant on public.profiles (intersected with
--       information_schema.columns; never tenant_id, role, is_tenant_owner, email)
--       + REVOKE INSERT/DELETE from anon/authenticated.
--     - Re-runnable DROP POLICY IF EXISTS + CREATE POLICY for all target tables,
--       followed by automated leftover-policy cleanup with RAISE NOTICE.
--     - tenant_team_names view (HR-only within caller's tenant).
--     - sync_child_tenant_id() trigger enforcing parent-child tenant_id match.
--   - 2.3 Atomic onboarding RPCs:
--     - create_tenant_for_hr(...)
--     - accept_hr_invite(...)
--   - End-of-migration self-test block verifying helpers, RLS, RPC privileges,
--     profile column locks, partial index, and policy quals before COMMIT.
-- =============================================================================

-- Optional demo database backfill (commented out by default; run manually if needed):
-- update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

BEGIN;

-- ---------------------------------------------------------------------------
-- 2.0 Preflight check: verify required tables, referenced columns, and
--     report count of unconfirmed auth.users
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req_tables text[] := ARRAY[
    'tenants',
    'profiles',
    'job_postings',
    'job_applications',
    'interview_schedules',
    'job_offers',
    'employees',
    'office_branches',
    'attendance_logs',
    'overtime_requests',
    'attendance_correction_requests',
    'payslips'
  ];
  v_tbl text;
  v_pair text[];
  v_required_columns text[][] := ARRAY[
    -- tenants
    ARRAY['tenants', 'id'],
    ARRAY['tenants', 'name'],
    ARRAY['tenants', 'industry'],
    ARRAY['tenants', 'company_size'],
    ARRAY['tenants', 'address'],
    ARRAY['tenants', 'logo_url'],
    ARRAY['tenants', 'plan'],
    ARRAY['tenants', 'plan_expires_at'],
    -- profiles
    ARRAY['profiles', 'id'],
    ARRAY['profiles', 'email'],
    ARRAY['profiles', 'first_name'],
    ARRAY['profiles', 'last_name'],
    ARRAY['profiles', 'phone'],
    ARRAY['profiles', 'role'],
    ARRAY['profiles', 'tenant_id'],
    ARRAY['profiles', 'tenant_name'],
    ARRAY['profiles', 'address'],
    ARRAY['profiles', 'created_at'],
    ARRAY['profiles', 'updated_at'],
    -- job_postings
    ARRAY['job_postings', 'id'],
    ARRAY['job_postings', 'tenant_id'],
    ARRAY['job_postings', 'created_by'],
    ARRAY['job_postings', 'is_published'],
    -- job_applications
    ARRAY['job_applications', 'id'],
    ARRAY['job_applications', 'tenant_id'],
    ARRAY['job_applications', 'job_id'],
    ARRAY['job_applications', 'applicant_id'],
    -- interview_schedules
    ARRAY['interview_schedules', 'id'],
    ARRAY['interview_schedules', 'tenant_id'],
    ARRAY['interview_schedules', 'application_id'],
    ARRAY['interview_schedules', 'applicant_id'],
    ARRAY['interview_schedules', 'office_branch_id'],
    -- job_offers
    ARRAY['job_offers', 'id'],
    ARRAY['job_offers', 'tenant_id'],
    ARRAY['job_offers', 'job_id'],
    ARRAY['job_offers', 'application_id'],
    ARRAY['job_offers', 'status'],
    -- employees
    ARRAY['employees', 'id'],
    ARRAY['employees', 'tenant_id'],
    ARRAY['employees', 'profile_id'],
    -- office_branches
    ARRAY['office_branches', 'id'],
    ARRAY['office_branches', 'tenant_id'],
    ARRAY['office_branches', 'name'],
    ARRAY['office_branches', 'address'],
    ARRAY['office_branches', 'latitude'],
    ARRAY['office_branches', 'longitude'],
    ARRAY['office_branches', 'radius_meters'],
    -- attendance_logs
    ARRAY['attendance_logs', 'id'],
    ARRAY['attendance_logs', 'tenant_id'],
    ARRAY['attendance_logs', 'employee_id'],
    -- overtime_requests
    ARRAY['overtime_requests', 'id'],
    ARRAY['overtime_requests', 'tenant_id'],
    ARRAY['overtime_requests', 'employee_id'],
    ARRAY['overtime_requests', 'status'],
    -- attendance_correction_requests
    ARRAY['attendance_correction_requests', 'id'],
    ARRAY['attendance_correction_requests', 'tenant_id'],
    ARRAY['attendance_correction_requests', 'employee_id'],
    ARRAY['attendance_correction_requests', 'status'],
    -- payslips
    ARRAY['payslips', 'id'],
    ARRAY['payslips', 'tenant_id'],
    ARRAY['payslips', 'employee_id'],
    ARRAY['payslips', 'payroll_period_id'],
    ARRAY['payslips', 'created_at']
  ];
  v_optional_columns text[][] := ARRAY[
    ARRAY['applications', 'id'],
    ARRAY['applications', 'tenant_id'],
    ARRAY['applications', 'job_posting_id'],
    ARRAY['applications', 'candidate_id'],
    ARRAY['payroll_periods', 'id'],
    ARRAY['payroll_periods', 'tenant_id']
  ];
  v_unconfirmed_count bigint := 0;
BEGIN
  -- 1. Check required tables
  FOREACH v_tbl IN ARRAY v_req_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_tbl
    ) THEN
      RAISE EXCEPTION 'Preflight failed: required table public.% is missing', v_tbl;
    END IF;
  END LOOP;

  -- 2. Check required columns on required tables
  FOR i IN 1..array_length(v_required_columns, 1) LOOP
    v_pair := ARRAY[v_required_columns[i][1], v_required_columns[i][2]];
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_pair[1]
        AND column_name = v_pair[2]
    ) THEN
      RAISE EXCEPTION 'Preflight failed: required column %.% does not exist', v_pair[1], v_pair[2];
    END IF;
  END LOOP;

  -- 3. Check referenced columns on optional tables (applications, payroll_periods) when present
  FOR i IN 1..array_length(v_optional_columns, 1) LOOP
    v_pair := ARRAY[v_optional_columns[i][1], v_optional_columns[i][2]];
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_pair[1]
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_pair[1]
        AND column_name = v_pair[2]
    ) THEN
      RAISE EXCEPTION 'Preflight failed: required column %.% does not exist', v_pair[1], v_pair[2];
    END IF;
  END LOOP;

  -- 4. Notice count of unconfirmed auth.users
  SELECT count(*) INTO v_unconfirmed_count
  FROM auth.users
  WHERE email_confirmed_at IS NULL;

  RAISE NOTICE 'Preflight: auth.users with email_confirmed_at IS NULL = %', v_unconfirmed_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.1 Schema: profiles.is_tenant_owner + tenant_invites + indexes
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_tenant_owner boolean NOT NULL DEFAULT false;

ALTER TABLE public.office_branches
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

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

-- If tenant_invites already existed from an older schema, ensure required columns exist
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_one_pending_per_email
  ON public.tenant_invites (tenant_id, lower(invited_email))
  WHERE accepted_at IS NULL;

-- Index (tenant_id, created_at DESC) on each tenant-scoped table that has created_at
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_created_at
  ON public.profiles (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_tenant_created_at
  ON public.job_postings (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_created_at
  ON public.job_applications (tenant_id, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_applications_tenant_created_at ON public.applications (tenant_id, created_at DESC)';
  END IF;
END;
$$;

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
  v_row_json jsonb;
  v_job_id uuid;
  v_job_posting_id uuid;
  v_application_id uuid;
  v_employee_id uuid;
BEGIN
  v_row_json := to_jsonb(NEW);

  IF TG_TABLE_NAME = 'job_applications' THEN
    v_job_id := NULLIF(v_row_json->>'job_id', '')::uuid;
    IF v_job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = v_job_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'applications' THEN
    v_job_posting_id := NULLIF(v_row_json->>'job_posting_id', '')::uuid;
    IF v_job_posting_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = v_job_posting_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'interview_schedules' THEN
    v_job_id := NULLIF(v_row_json->>'job_id', '')::uuid;
    v_application_id := NULLIF(v_row_json->>'application_id', '')::uuid;
    IF v_job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = v_job_id;
    END IF;
    IF v_parent_tenant_id IS NULL AND v_application_id IS NOT NULL THEN
      SELECT ja.tenant_id INTO v_parent_tenant_id
      FROM public.job_applications ja
      WHERE ja.id = v_application_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'job_offers' THEN
    v_job_id := NULLIF(v_row_json->>'job_id', '')::uuid;
    v_application_id := NULLIF(v_row_json->>'application_id', '')::uuid;
    IF v_job_id IS NOT NULL THEN
      SELECT jp.tenant_id INTO v_parent_tenant_id
      FROM public.job_postings jp
      WHERE jp.id = v_job_id;
    END IF;
    IF v_parent_tenant_id IS NULL AND v_application_id IS NOT NULL THEN
      SELECT ja.tenant_id INTO v_parent_tenant_id
      FROM public.job_applications ja
      WHERE ja.id = v_application_id;
      IF v_parent_tenant_id IS NULL AND to_regclass('public.applications') IS NOT NULL THEN
        EXECUTE 'SELECT tenant_id FROM public.applications WHERE id = $1'
          INTO v_parent_tenant_id
          USING v_application_id;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('attendance_logs', 'overtime_requests', 'attendance_correction_requests', 'payslips') THEN
    v_employee_id := NULLIF(v_row_json->>'employee_id', '')::uuid;
    IF v_employee_id IS NOT NULL THEN
      SELECT e.tenant_id INTO v_parent_tenant_id
      FROM public.employees e
      WHERE e.id = v_employee_id;
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

DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_tenant_id_applications ON public.applications';
    EXECUTE 'CREATE TRIGGER trg_sync_tenant_id_applications BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.sync_child_tenant_id()';
  END IF;
END;
$$;

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
-- Build GRANT UPDATE column list DYNAMICALLY by intersecting the intended
-- safe column list with columns that actually exist in information_schema.
-- Never include tenant_id, role, is_tenant_owner, or email.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

DO $$
DECLARE
  v_intended_safe_cols text[] := ARRAY[
    'first_name',
    'last_name',
    'phone',
    'avatar',
    'avatar_url',
    'date_of_birth',
    'address',
    'city',
    'country',
    'work_setup',
    'work_location_id',
    'city_id',
    'province_id',
    'email_notifications',
    'push_notifications',
    'updated_at'
  ];
  v_forbidden_cols text[] := ARRAY[
    'tenant_id',
    'role',
    'is_tenant_owner',
    'email'
  ];
  v_final_cols text[];
  v_col_list_sql text;
BEGIN
  SELECT array_agg(c.column_name ORDER BY array_position(v_intended_safe_cols, c.column_name))
  INTO v_final_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name = ANY(v_intended_safe_cols)
    AND NOT (c.column_name = ANY(v_forbidden_cols));

  IF v_final_cols IS NULL OR array_length(v_final_cols, 1) IS NULL THEN
    RAISE EXCEPTION 'Dynamic profiles GRANT failed: no safe columns found on public.profiles';
  END IF;

  SELECT string_agg(format('%I', col), ', ')
  INTO v_col_list_sql
  FROM unnest(v_final_cols) AS col;

  EXECUTE format('GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated', v_col_list_sql);
  RAISE NOTICE 'Granted UPDATE on public.profiles to authenticated for columns: %', v_col_list_sql;
END;
$$;

-- Lock down direct client access on public.tenant_invites (server action only)
REVOKE ALL ON TABLE public.tenant_invites FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on target tenant-scoped tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.payroll_periods') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

-- 1) tenants policies
DROP POLICY IF EXISTS "tenants_member_select" ON public.tenants;
CREATE POLICY "tenants_member_select"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "tenants_published_job_select" ON public.tenants;
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

DROP POLICY IF EXISTS "tenants_owner_update" ON public.tenants;
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

-- 2) profiles policies (own row OR applicant/employee of caller's HR tenant)
DROP POLICY IF EXISTS "profiles_select_own_or_tenant_applicant" ON public.profiles;
DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE $pol$
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
        )
    $pol$;
  ELSE
    EXECUTE $pol$
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
                FROM public.employees e
                WHERE e.profile_id = profiles.id
                  AND e.tenant_id = (SELECT public.current_tenant_id())
              )
            )
          )
        )
    $pol$;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 3) tenant_invites policies (tenant owner HR only; raw token never exposed)
DROP POLICY IF EXISTS "tenant_invites_owner_all" ON public.tenant_invites;
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
DROP POLICY IF EXISTS "jobs_select_published_or_tenant_hr" ON public.job_postings;
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

DROP POLICY IF EXISTS "jobs_hr_insert" ON public.job_postings;
CREATE POLICY "jobs_hr_insert"
  ON public.job_postings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

DROP POLICY IF EXISTS "jobs_hr_update" ON public.job_postings;
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

DROP POLICY IF EXISTS "jobs_hr_delete" ON public.job_postings;
CREATE POLICY "jobs_hr_delete"
  ON public.job_postings
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_is_hr_manager())
  );

-- 5) job_applications policies (HR in tenant + applicant own rows)
DROP POLICY IF EXISTS "job_applications_hr_all" ON public.job_applications;
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

DROP POLICY IF EXISTS "job_applications_candidate_select" ON public.job_applications;
CREATE POLICY "job_applications_candidate_select"
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (applicant_id = auth.uid());

DROP POLICY IF EXISTS "job_applications_candidate_insert" ON public.job_applications;
CREATE POLICY "job_applications_candidate_insert"
  ON public.job_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = auth.uid());

DROP POLICY IF EXISTS "job_applications_candidate_update" ON public.job_applications;
CREATE POLICY "job_applications_candidate_update"
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (applicant_id = auth.uid())
  WITH CHECK (applicant_id = auth.uid());

-- 6) applications policies (if table exists: HR in tenant + candidate own rows)
DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "applications_hr_all" ON public.applications';
    EXECUTE $pol$
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
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "applications_candidate_select" ON public.applications';
    EXECUTE $pol$
      CREATE POLICY "applications_candidate_select"
        ON public.applications
        FOR SELECT
        TO authenticated
        USING (candidate_id = auth.uid())
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "applications_candidate_insert" ON public.applications';
    EXECUTE $pol$
      CREATE POLICY "applications_candidate_insert"
        ON public.applications
        FOR INSERT
        TO authenticated
        WITH CHECK (candidate_id = auth.uid())
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "applications_candidate_update" ON public.applications';
    EXECUTE $pol$
      CREATE POLICY "applications_candidate_update"
        ON public.applications
        FOR UPDATE
        TO authenticated
        USING (candidate_id = auth.uid())
        WITH CHECK (candidate_id = auth.uid())
    $pol$;
  END IF;
END;
$$;

-- 7) interview_schedules policies (HR in tenant + applicant own rows)
DROP POLICY IF EXISTS "interview_schedules_hr_all" ON public.interview_schedules;
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

DROP POLICY IF EXISTS "interview_schedules_applicant_select" ON public.interview_schedules;
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

DROP POLICY IF EXISTS "interview_schedules_applicant_update" ON public.interview_schedules;
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
DROP POLICY IF EXISTS "job_offers_hr_all" ON public.job_offers;
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

DROP POLICY IF EXISTS "job_offers_candidate_select" ON public.job_offers;
DROP POLICY IF EXISTS "job_offers_candidate_update" ON public.job_offers;
DO $$
BEGIN
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE $pol$
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
        )
    $pol$;

    EXECUTE $pol$
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
        )
    $pol$;
  ELSE
    EXECUTE $pol$
      CREATE POLICY "job_offers_candidate_select"
        ON public.job_offers
        FOR SELECT
        TO authenticated
        USING (
          status <> 'DRAFT'
          AND EXISTS (
            SELECT 1
            FROM public.job_applications ja
            WHERE ja.id = job_offers.application_id
              AND ja.applicant_id = auth.uid()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "job_offers_candidate_update"
        ON public.job_offers
        FOR UPDATE
        TO authenticated
        USING (
          status IN ('SENT', 'REVISED')
          AND EXISTS (
            SELECT 1
            FROM public.job_applications ja
            WHERE ja.id = job_offers.application_id
              AND ja.applicant_id = auth.uid()
          )
        )
        WITH CHECK (
          status IN ('NEGOTIATION_PENDING', 'ACCEPTED', 'DECLINED')
        )
    $pol$;
  END IF;
END;
$$;

-- 9) employees policies (HR in tenant + employee own row)
DROP POLICY IF EXISTS "employees_hr_all" ON public.employees;
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

DROP POLICY IF EXISTS "employees_self_select" ON public.employees;
CREATE POLICY "employees_self_select"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- 10) office_branches policies (HR manage in tenant; tenant members, interview applicants, and published job viewers can SELECT)
DROP POLICY IF EXISTS "office_branches_hr_all" ON public.office_branches;
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

DROP POLICY IF EXISTS "office_branches_member_or_interview_select" ON public.office_branches;
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
DROP POLICY IF EXISTS "attendance_logs_hr_all" ON public.attendance_logs;
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

DROP POLICY IF EXISTS "attendance_logs_employee_select" ON public.attendance_logs;
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

DROP POLICY IF EXISTS "attendance_logs_employee_insert" ON public.attendance_logs;
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

DROP POLICY IF EXISTS "attendance_logs_employee_update" ON public.attendance_logs;
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
DROP POLICY IF EXISTS "overtime_requests_hr_all" ON public.overtime_requests;
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

DROP POLICY IF EXISTS "overtime_requests_employee_select" ON public.overtime_requests;
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

DROP POLICY IF EXISTS "overtime_requests_employee_insert" ON public.overtime_requests;
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

DROP POLICY IF EXISTS "overtime_requests_employee_update" ON public.overtime_requests;
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
DROP POLICY IF EXISTS "attendance_correction_requests_hr_all" ON public.attendance_correction_requests;
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

DROP POLICY IF EXISTS "attendance_correction_requests_employee_select" ON public.attendance_correction_requests;
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

DROP POLICY IF EXISTS "attendance_correction_requests_employee_insert" ON public.attendance_correction_requests;
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
DROP POLICY IF EXISTS "payslips_hr_all" ON public.payslips;
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

DROP POLICY IF EXISTS "payslips_employee_select" ON public.payslips;
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
    EXECUTE 'DROP POLICY IF EXISTS "payroll_periods_hr_all" ON public.payroll_periods';
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

    EXECUTE 'DROP POLICY IF EXISTS "payroll_periods_employee_select" ON public.payroll_periods';
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
-- Automated leftover-policy cleanup on ONLY the tables this migration enables
-- RLS on. Drops any policy not in this migration's allowlist and logs each via
-- RAISE NOTICE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_managed_tables text[] := ARRAY[
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
  v_allowed_policies text[] := ARRAY[
    'tenants_member_select',
    'tenants_published_job_select',
    'tenants_owner_update',
    'profiles_select_own_or_tenant_applicant',
    'profiles_update_own',
    'tenant_invites_owner_all',
    'jobs_select_published_or_tenant_hr',
    'jobs_hr_insert',
    'jobs_hr_update',
    'jobs_hr_delete',
    'job_applications_hr_all',
    'job_applications_candidate_select',
    'job_applications_candidate_insert',
    'job_applications_candidate_update',
    'applications_hr_all',
    'applications_candidate_select',
    'applications_candidate_insert',
    'applications_candidate_update',
    'interview_schedules_hr_all',
    'interview_schedules_applicant_select',
    'interview_schedules_applicant_update',
    'job_offers_hr_all',
    'job_offers_candidate_select',
    'job_offers_candidate_update',
    'employees_hr_all',
    'employees_self_select',
    'office_branches_hr_all',
    'office_branches_member_or_interview_select',
    'attendance_logs_hr_all',
    'attendance_logs_employee_select',
    'attendance_logs_employee_insert',
    'attendance_logs_employee_update',
    'overtime_requests_hr_all',
    'overtime_requests_employee_select',
    'overtime_requests_employee_insert',
    'overtime_requests_employee_update',
    'attendance_correction_requests_hr_all',
    'attendance_correction_requests_employee_select',
    'attendance_correction_requests_employee_insert',
    'payslips_hr_all',
    'payslips_employee_select',
    'payroll_periods_hr_all',
    'payroll_periods_employee_select'
  ];
  v_pol record;
BEGIN
  FOR v_pol IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_managed_tables)
      AND NOT (policyname = ANY(v_allowed_policies))
    ORDER BY tablename, policyname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_pol.tablename);
    RAISE NOTICE 'Dropped leftover policy % on public.% (cmd=%)', v_pol.policyname, v_pol.tablename, v_pol.cmd;
  END LOOP;
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

-- ---------------------------------------------------------------------------
-- 2.4 End-of-migration Self-Test Block (raises EXCEPTION and rolls back on failure)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn_name text;
  v_helper_fns text[] := ARRAY[
    'current_tenant_id',
    'current_user_is_owner',
    'current_user_is_hr_manager'
  ];
  v_secdef boolean;
  v_config text[];
  v_rls_tables text[] := ARRAY[
    'tenants',
    'profiles',
    'tenant_invites',
    'job_postings',
    'job_applications',
    'interview_schedules',
    'job_offers',
    'employees',
    'office_branches',
    'attendance_logs',
    'overtime_requests',
    'attendance_correction_requests',
    'payslips'
  ];
  v_tbl text;
  v_rls_enabled boolean;
  v_create_fn_sig text := 'public.create_tenant_for_hr(uuid, text, text, text, text, text, text, text, text, text, text)';
  v_accept_fn_sig text := 'public.accept_hr_invite(uuid, text, text, text, text, text)';
  v_bad_policy record;
  v_managed_tables text[] := ARRAY[
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
  v_allowed_policies text[] := ARRAY[
    'tenants_member_select',
    'tenants_published_job_select',
    'tenants_owner_update',
    'profiles_select_own_or_tenant_applicant',
    'profiles_update_own',
    'tenant_invites_owner_all',
    'jobs_select_published_or_tenant_hr',
    'jobs_hr_insert',
    'jobs_hr_update',
    'jobs_hr_delete',
    'job_applications_hr_all',
    'job_applications_candidate_select',
    'job_applications_candidate_insert',
    'job_applications_candidate_update',
    'applications_hr_all',
    'applications_candidate_select',
    'applications_candidate_insert',
    'applications_candidate_update',
    'interview_schedules_hr_all',
    'interview_schedules_applicant_select',
    'interview_schedules_applicant_update',
    'job_offers_hr_all',
    'job_offers_candidate_select',
    'job_offers_candidate_update',
    'employees_hr_all',
    'employees_self_select',
    'office_branches_hr_all',
    'office_branches_member_or_interview_select',
    'attendance_logs_hr_all',
    'attendance_logs_employee_select',
    'attendance_logs_employee_insert',
    'attendance_logs_employee_update',
    'overtime_requests_hr_all',
    'overtime_requests_employee_select',
    'overtime_requests_employee_insert',
    'overtime_requests_employee_update',
    'attendance_correction_requests_hr_all',
    'attendance_correction_requests_employee_select',
    'attendance_correction_requests_employee_insert',
    'payslips_hr_all',
    'payslips_employee_select',
    'payroll_periods_hr_all',
    'payroll_periods_employee_select'
  ];
  v_pol_name text;
  v_pol_count bigint;
BEGIN
  -- 1. Verify current_tenant_id(), current_user_is_owner(), current_user_is_hr_manager()
  --    exist, are SECURITY DEFINER, and have search_path configured.
  FOREACH v_fn_name IN ARRAY v_helper_fns LOOP
    SELECT p.prosecdef, p.proconfig
    INTO v_secdef, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_fn_name
    LIMIT 1;

    IF v_secdef IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Self-test failed: public.%() is missing or not SECURITY DEFINER', v_fn_name;
    END IF;

    IF v_config IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_config) cfg WHERE cfg ILIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'Self-test failed: public.%() does not have search_path set', v_fn_name;
    END IF;
  END LOOP;

  -- 2. Verify RLS is enabled on all preflight tables plus tenant_invites
  FOREACH v_tbl IN ARRAY v_rls_tables LOOP
    SELECT c.relrowsecurity
    INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_tbl;

    IF v_rls_enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Self-test failed: RLS is not enabled on public.%', v_tbl;
    END IF;
  END LOOP;

  -- 3. Verify create_tenant_for_hr and accept_hr_invite are executable by service_role
  --    and NOT executable by anon, authenticated, or PUBLIC.
  IF NOT has_function_privilege('service_role', v_create_fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'Self-test failed: service_role lacks EXECUTE on create_tenant_for_hr';
  END IF;
  IF has_function_privilege('anon', v_create_fn_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_create_fn_sig, 'EXECUTE')
     OR has_function_privilege('public', v_create_fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'Self-test failed: create_tenant_for_hr is executable by anon/authenticated/public';
  END IF;

  IF NOT has_function_privilege('service_role', v_accept_fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'Self-test failed: service_role lacks EXECUTE on accept_hr_invite';
  END IF;
  IF has_function_privilege('anon', v_accept_fn_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_accept_fn_sig, 'EXECUTE')
     OR has_function_privilege('public', v_accept_fn_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'Self-test failed: accept_hr_invite is executable by anon/authenticated/public';
  END IF;

  -- 4. Verify authenticated has no UPDATE privilege on profiles.tenant_id, profiles.role,
  --    profiles.is_tenant_owner, and no INSERT or DELETE on public.profiles.
  IF has_column_privilege('authenticated', 'public.profiles', 'tenant_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Self-test failed: authenticated still has UPDATE on profiles.tenant_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'Self-test failed: authenticated still has UPDATE on profiles.role';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'is_tenant_owner', 'UPDATE') THEN
    RAISE EXCEPTION 'Self-test failed: authenticated still has UPDATE on profiles.is_tenant_owner';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'Self-test failed: authenticated still has INSERT on public.profiles';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'DELETE') THEN
    RAISE EXCEPTION 'Self-test failed: authenticated still has DELETE on public.profiles';
  END IF;

  -- 5. Verify tenant_invites has partial unique index idx_tenant_invites_one_pending_per_email
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tenant_invites'
      AND indexname = 'idx_tenant_invites_one_pending_per_email'
  ) THEN
    RAISE EXCEPTION 'Self-test failed: idx_tenant_invites_one_pending_per_email is missing on public.tenant_invites';
  END IF;

  -- 6. Verify every tenant-scoped table has no policy with qual 'true' for authenticated or anon
  --    (except tenants_published_job_select and jobs_select_published_or_tenant_hr).
  FOR v_bad_policy IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_rls_tables)
      AND policyname NOT IN ('tenants_published_job_select', 'jobs_select_published_or_tenant_hr')
      AND (roles && ARRAY['authenticated'::name, 'anon'::name, 'public'::name])
      AND lower(btrim(COALESCE(qual, ''))) IN ('true', '(true)')
  LOOP
    RAISE EXCEPTION 'Self-test failed: overly permissive policy % on public.% has qual=%',
      v_bad_policy.policyname, v_bad_policy.tablename, v_bad_policy.qual;
  END LOOP;

  -- 7. Verify every name in v_allowed_policies exists in pg_policies (for tables that exist)
  FOREACH v_pol_name IN ARRAY v_allowed_policies LOOP
    IF v_pol_name LIKE 'applications_%' AND to_regclass('public.applications') IS NULL THEN
      CONTINUE;
    END IF;
    IF v_pol_name LIKE 'payroll_periods_%' AND to_regclass('public.payroll_periods') IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = v_pol_name
    ) THEN
      RAISE EXCEPTION 'Self-test failed: expected policy % is missing from pg_policies', v_pol_name;
    END IF;
  END LOOP;

  -- 8. Verify every managed table that exists has >= 1 policy in pg_policies
  FOREACH v_tbl IN ARRAY v_managed_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      SELECT count(*)
      INTO v_pol_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_tbl;

      IF v_pol_count < 1 THEN
        RAISE EXCEPTION 'Self-test failed: managed table public.% has 0 policies in pg_policies', v_tbl;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Self-test passed: all multi-HR tenant RLS, helper, privilege, and index assertions succeeded.';
END;
$$;

COMMIT;

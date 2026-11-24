-- ============================================================================
-- PHASE 1: Granular HR Roles, Reporting Hierarchy, Job Headcount & Walk-In Prep
-- Non-breaking additive migration aligned with existing Kayod schema
-- ============================================================================

-- 1. PROFILES: Add granular hr_role while keeping top-level user_role untouched
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hr_role text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_hr_role;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_hr_role
  CHECK (
    hr_role IS NULL
    OR hr_role IN ('hr_admin', 'hr_generalist', 'recruiter', 'payroll_officer')
  );

-- Backfill existing HR managers/admins so no active HR user loses access
UPDATE public.profiles
SET hr_role = 'hr_admin'
WHERE role::text IN ('hr_manager', 'hr', 'admin')
  AND hr_role IS NULL;

-- 2. TENANT_INVITES: Support inviting HR staff with a specific sub-role
ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS invited_hr_role text NOT NULL DEFAULT 'hr_generalist';

ALTER TABLE public.tenant_invites
  DROP CONSTRAINT IF EXISTS chk_tenant_invites_hr_role;

ALTER TABLE public.tenant_invites
  ADD CONSTRAINT chk_tenant_invites_hr_role
  CHECK (
    invited_hr_role IN ('hr_admin', 'hr_generalist', 'recruiter', 'payroll_officer')
  );

-- 3. Update create_tenant_for_hr & accept_hr_invite to populate profiles.hr_role
CREATE OR REPLACE FUNCTION public.create_tenant_for_hr(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_company_name text,
  p_industry text DEFAULT NULL::text,
  p_company_size text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_plan text DEFAULT 'starter'::text,
  p_logo_url text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    name, industry, company_size, address, logo_url, plan, plan_expires_at
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
    id, email, first_name, last_name, phone, role, hr_role, tenant_id, tenant_name, is_tenant_owner, address
  )
  VALUES (
    p_user_id,
    lower(btrim(COALESCE(p_email, ''))),
    btrim(COALESCE(p_first_name, '')),
    btrim(COALESCE(p_last_name, '')),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    'hr_manager',
    'hr_admin',
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
    hr_role = 'hr_admin',
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
      tenant_id, name, address, latitude, longitude, radius_meters, is_primary
    )
    VALUES (
      v_tenant_id, 'Main Office', v_branch_address, 10.3157, 123.8854, 200, true
    );
  END IF;

  RETURN v_tenant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_hr_invite(
  p_user_id uuid,
  p_token_hash text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_tenant_name text;
  v_assigned_hr_role text;
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

  v_assigned_hr_role := COALESCE(NULLIF(btrim(v_invite.invited_hr_role), ''), 'hr_generalist');

  UPDATE public.tenant_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, phone, role, hr_role, tenant_id, tenant_name, is_tenant_owner
  )
  VALUES (
    p_user_id,
    lower(btrim(v_invite.invited_email)),
    btrim(COALESCE(p_first_name, '')),
    btrim(COALESCE(p_last_name, '')),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    'hr_manager',
    v_assigned_hr_role,
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
    hr_role = v_assigned_hr_role,
    tenant_id = EXCLUDED.tenant_id,
    tenant_name = EXCLUDED.tenant_name,
    is_tenant_owner = false,
    updated_at = now();

  RETURN v_invite.tenant_id;
END;
$function$;

-- 4. EMPLOYEES: Use existing `reports_to` column + add `job_level` & self-loop guard
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS job_level text NOT NULL DEFAULT 'staff';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS chk_employees_job_level;

ALTER TABLE public.employees
  ADD CONSTRAINT chk_employees_job_level
  CHECK (job_level IN ('staff', 'team_lead', 'supervisor', 'manager'));

CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON public.employees(reports_to);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_dept_level ON public.employees(tenant_id, department_id, job_level);

CREATE OR REPLACE FUNCTION public.prevent_self_reports_to()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reports_to IS NOT NULL AND NEW.reports_to = NEW.id THEN
    RAISE EXCEPTION 'An employee cannot report to themselves.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_prevent_self_reports_to ON public.employees;
CREATE TRIGGER trg_employees_prevent_self_reports_to
BEFORE INSERT OR UPDATE OF reports_to ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_reports_to();

-- 5. JOB_POSTINGS: Add default_supervisor_id (using reports_to convention) & walk-in counter
-- Note: `slots` already exists on job_postings (integer NOT NULL DEFAULT 1)
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS default_supervisor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hired_walkin_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS chk_job_postings_walkin_count;

ALTER TABLE public.job_postings
  ADD CONSTRAINT chk_job_postings_walkin_count
  CHECK (hired_walkin_count >= 0);

-- 6. INTERVIEW_SCHEDULES: Support walk-in external interviews & technical interview panelists
-- Note: `job_id` already exists on interview_schedules
ALTER TABLE public.interview_schedules
  ALTER COLUMN application_id DROP NOT NULL;

ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walk_in_candidate_name text,
  ADD COLUMN IF NOT EXISTS walk_in_contact text,
  ADD COLUMN IF NOT EXISTS interview_stage text NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS panelist_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.interview_schedules
  DROP CONSTRAINT IF EXISTS chk_interview_schedules_stage;

ALTER TABLE public.interview_schedules
  ADD CONSTRAINT chk_interview_schedules_stage
  CHECK (interview_stage IN ('initial', 'technical'));

ALTER TABLE public.interview_schedules
  DROP CONSTRAINT IF EXISTS chk_interview_schedules_candidate_source;

ALTER TABLE public.interview_schedules
  ADD CONSTRAINT chk_interview_schedules_candidate_source
  CHECK (
    (is_walk_in = false AND application_id IS NOT NULL)
    OR
    (is_walk_in = true AND application_id IS NULL AND btrim(COALESCE(walk_in_candidate_name, '')) <> '')
  );

-- 7. TENANT-SCOPED & RECURSION-SAFE RLS HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.has_hr_role(
  p_tenant_id uuid,
  p_allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.tenant_id = p_tenant_id
      AND p.role::text IN ('hr_manager', 'hr', 'admin')
      AND (
        COALESCE(p.is_tenant_owner, false) = true
        OR COALESCE(p.hr_role, 'hr_admin') = ANY(p_allowed_roles)
      )
  );
$$;

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
      AND sup.employment_status = 'active'
  );
$$;

-- Allow Supervisors/Team Leads to read their direct reports in `employees` (recursion-safe via SECURITY DEFINER)
DROP POLICY IF EXISTS "Supervisors can view direct reports" ON public.employees;
CREATE POLICY "Supervisors can view direct reports"
ON public.employees
FOR SELECT
USING (
  public.is_direct_supervisor(id)
);

-- 8. UPDATE dev_toggle_user_role TO SUPPORT hr_manager & PRESERVE hr_role
CREATE OR REPLACE FUNCTION public.dev_toggle_user_role(
  target_user_id uuid,
  target_tenant_id uuid DEFAULT NULL::uuid,
  new_role text DEFAULT 'applicant'::text,
  new_hr_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  resolved_tenant_id UUID;
  default_tenant UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  existing_emp_id UUID;
  resolved_hr_role TEXT;
BEGIN
  SELECT tenant_id INTO resolved_tenant_id
  FROM profiles
  WHERE id = target_user_id;

  IF resolved_tenant_id IS NULL THEN
    resolved_tenant_id := COALESCE(target_tenant_id, default_tenant);
  END IF;

  IF new_role IN ('hr_manager', 'hr') THEN
    SELECT COALESCE(new_hr_role, hr_role, 'hr_admin') INTO resolved_hr_role
    FROM profiles
    WHERE id = target_user_id;

    UPDATE profiles
    SET
      role = 'hr_manager',
      hr_role = resolved_hr_role,
      tenant_id = resolved_tenant_id,
      updated_at = NOW()
    WHERE id = target_user_id;

  ELSIF new_role = 'employee' THEN
    UPDATE profiles
    SET role = 'employee', updated_at = NOW()
    WHERE id = target_user_id;

    SELECT id INTO existing_emp_id
    FROM employees
    WHERE profile_id = target_user_id
    LIMIT 1;

    IF existing_emp_id IS NOT NULL THEN
      UPDATE employees
      SET
        employment_status = 'active',
        tenant_id = COALESCE(employees.tenant_id, resolved_tenant_id),
        updated_at = NOW()
      WHERE id = existing_emp_id;
    ELSE
      INSERT INTO employees (
        tenant_id, profile_id, employee_number, job_title, employment_type,
        employment_status, start_date, base_salary, salary, pay_frequency, currency, updated_at
      ) VALUES (
        resolved_tenant_id, target_user_id, 'EMP-' || SUBSTRING(target_user_id::text, 1, 8),
        'Staff Employee', 'full_time', 'active', CURRENT_DATE, 30000.00, 30000.00, 'monthly', 'PHP', NOW()
      );
    END IF;

    UPDATE applications
    SET status = 'hired', updated_at = NOW()
    WHERE candidate_id = target_user_id AND status != 'hired';

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
      UPDATE job_applications
      SET status = 'hired', updated_at = NOW()
      WHERE applicant_id = target_user_id AND status != 'hired';
    END IF;

  ELSIF new_role IN ('applicant', 'candidate') THEN
    UPDATE profiles
    SET role = 'candidate', updated_at = NOW()
    WHERE id = target_user_id;

    UPDATE employees
    SET
      employment_status = 'separated',
      end_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE profile_id = target_user_id;

    UPDATE applications
    SET status = 'submitted', updated_at = NOW()
    WHERE candidate_id = target_user_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
      UPDATE job_applications
      SET status = 'submitted', updated_at = NOW()
      WHERE applicant_id = target_user_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target role %', new_role;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'new_role', new_role,
    'hr_role', resolved_hr_role,
    'tenant_id', resolved_tenant_id
  );
END;
$function$;
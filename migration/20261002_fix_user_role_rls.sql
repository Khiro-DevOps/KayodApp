-- Normalize role data and make HR RLS checks safe for authenticated clients.

-- Show the enum values before the remediation runs.
SELECT enumlabel AS user_role_value
FROM pg_enum
WHERE enumtypid = 'public.user_role'::regtype
ORDER BY enumsortorder;

DO $$
DECLARE
  hr_role text;
  enum_values text[];
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder)
  INTO enum_values
  FROM pg_enum
  WHERE enumtypid = 'public.user_role'::regtype;

  RAISE NOTICE 'user_role accepts: %', enum_values;

  -- Prefer the repository's canonical HR role, while supporting deployments
  -- that use the shorter lowercase value.
  SELECT enumlabel
  INTO hr_role
  FROM pg_enum
  WHERE enumtypid = 'public.user_role'::regtype
    AND lower(enumlabel) IN ('hr_manager', 'hr')
  ORDER BY CASE lower(enumlabel)
    WHEN 'hr_manager' THEN 1
    WHEN 'hr' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF hr_role IS NULL THEN
    RAISE EXCEPTION 'user_role has no supported HR value: %', enum_values;
  END IF;

  -- A profile column backed by an enum cannot normally contain "HR", but this
  -- handles installations where that enum label was added during development.
  EXECUTE format(
    'UPDATE public.profiles SET role = %L::public.user_role, updated_at = now() WHERE role::text = %L',
    hr_role,
    'HR'
  );

  -- Signup metadata is text and is the other source of the 22P02 cast error.
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', to_jsonb(hr_role))
  WHERE upper(COALESCE(raw_user_meta_data->>'role', '')) = 'HR';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_hr()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role::text) IN ('hr_manager', 'hr', 'admin')
  )
  OR lower(COALESCE(auth.jwt() ->> 'role', '')) IN ('hr_manager', 'hr', 'admin')
  OR lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN ('hr_manager', 'hr', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_role public.user_role;
BEGIN
  SELECT role INTO resolved_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF resolved_role IS NOT NULL THEN
    RETURN resolved_role;
  END IF;

  SELECT role::public.user_role
  INTO resolved_role
  FROM (
    SELECT CASE lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', ''))
      WHEN 'hr' THEN 'hr_manager'
      WHEN 'hr_manager' THEN 'hr_manager'
      WHEN 'admin' THEN 'admin'
      WHEN 'employee' THEN 'employee'
      ELSE 'candidate'
    END AS role
  ) metadata_role;

  RETURN resolved_role;
END;
$$;

DROP POLICY IF EXISTS "job_applications_select_own" ON public.job_applications;
CREATE POLICY "job_applications_select_own" ON public.job_applications
  FOR SELECT USING (auth.uid() = applicant_id OR public.is_hr());

DROP POLICY IF EXISTS "job_applications_update_own" ON public.job_applications;
CREATE POLICY "job_applications_update_own" ON public.job_applications
  FOR UPDATE USING (auth.uid() = applicant_id OR public.is_hr())
  WITH CHECK (auth.uid() = applicant_id OR public.is_hr());
-- ============================================================
-- MIGRATION: Harden handle_new_user() against client metadata privilege escalation
-- File: 20261129_harden_handle_new_user.sql
-- Purpose:
--   - Ignore client-supplied raw_user_meta_data / raw_app_meta_data for
--     tenant_id (always NULL) and is_tenant_owner (always false).
--   - Coerce role to the applicant default ('candidate'::public.user_role)
--     unless the value is already that default.
--   - Keep all other trigger behavior from 20261126_fix_handle_new_user_trigger.sql
--     identical. Privileged HR/employee onboarding and dev tools set role,
--     tenant_id, and is_tenant_owner via service_role RPCs or admin client.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_role text;
  v_role public.user_role;
  v_raw_work_setup text;
  v_work_setup public.work_setup;
  v_dob date;
  v_age int;
  v_city_id uuid;
  v_province_id uuid;
  v_tenant_id uuid;
  v_is_tenant_owner boolean;
  v_consented_at timestamptz;
BEGIN
  v_raw_role := lower(NULLIF(trim(new.raw_user_meta_data->>'role'), ''));
  v_role := CASE
    WHEN v_raw_role = 'candidate' THEN 'candidate'::public.user_role
    ELSE 'candidate'::public.user_role
  END;

  v_raw_work_setup := lower(NULLIF(trim(new.raw_user_meta_data->>'work_setup'), ''));
  v_work_setup := CASE
    WHEN v_raw_work_setup IN ('onsite', 'remote', 'hybrid', 'wfh')
      THEN v_raw_work_setup::public.work_setup
    ELSE NULL
  END;

  v_dob := CASE
    WHEN COALESCE(new.raw_user_meta_data->>'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (new.raw_user_meta_data->>'date_of_birth')::date
    ELSE NULL
  END;

  v_age := CASE
    WHEN COALESCE(new.raw_user_meta_data->>'age', '') ~ '^\d+$'
      AND (new.raw_user_meta_data->>'age')::int BETWEEN 0 AND 120
      THEN (new.raw_user_meta_data->>'age')::int
    ELSE NULL
  END;

  v_city_id := CASE
    WHEN COALESCE(new.raw_user_meta_data->>'city_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (new.raw_user_meta_data->>'city_id')::uuid
    ELSE NULL
  END;

  v_province_id := CASE
    WHEN COALESCE(new.raw_user_meta_data->>'province_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (new.raw_user_meta_data->>'province_id')::uuid
    ELSE NULL
  END;

  -- Never trust client metadata for tenant_id or is_tenant_owner
  v_tenant_id := NULL;
  v_is_tenant_owner := false;

  BEGIN
    v_consented_at := CASE
      WHEN NULLIF(trim(new.raw_user_meta_data->>'privacy_consented_at'), '') IS NOT NULL
        THEN (new.raw_user_meta_data->>'privacy_consented_at')::timestamptz
      ELSE NULL
    END;
  EXCEPTION WHEN OTHERS THEN
    v_consented_at := NULL;
  END;

  BEGIN
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      phone,
      role,
      date_of_birth,
      age,
      address,
      city,
      country,
      work_setup,
      city_id,
      province_id,
      tenant_id,
      is_tenant_owner,
      privacy_consent_version,
      privacy_consented_at
    )
    VALUES (
      new.id,
      COALESCE(new.email, ''),
      COALESCE(new.raw_user_meta_data->>'first_name', ''),
      COALESCE(new.raw_user_meta_data->>'last_name', ''),
      COALESCE(new.raw_user_meta_data->>'phone', ''),
      v_role,
      v_dob,
      v_age,
      NULLIF(new.raw_user_meta_data->>'address', ''),
      NULLIF(new.raw_user_meta_data->>'city', ''),
      COALESCE(NULLIF(new.raw_user_meta_data->>'country', ''), 'Philippines'),
      v_work_setup,
      v_city_id,
      v_province_id,
      v_tenant_id,
      v_is_tenant_owner,
      NULLIF(new.raw_user_meta_data->>'privacy_consent_version', ''),
      v_consented_at
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), public.profiles.first_name),
      last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), public.profiles.last_name),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.profiles.phone),
      updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    -- Handle orphaned profile row with same email from a previously deleted auth user
    RAISE WARNING 'handle_new_user unique_violation for user % (%): %', new.id, new.email, SQLERRM;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user % (%): %', new.id, new.email, SQLERRM;
  END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

NOTIFY pgrst, 'reload schema';

COMMIT;

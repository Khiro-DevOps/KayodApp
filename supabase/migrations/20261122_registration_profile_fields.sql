-- ============================================================
-- MIGRATION: Registration Profile Fields & Trigger Fix (U4)
-- File: 20261122_registration_profile_fields.sql
-- ============================================================

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS work_setup public.work_setup,
  ADD COLUMN IF NOT EXISTS city_id uuid,
  ADD COLUMN IF NOT EXISTS province_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS privacy_consent_version text,
  ADD COLUMN IF NOT EXISTS privacy_consented_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_work_setup public.work_setup;
  v_city_id uuid;
  v_province_id uuid;
  v_tenant_id uuid;
  v_consented_at timestamptz;
BEGIN
  v_role := COALESCE(
    NULLIF(trim(new.raw_user_meta_data->>'role'), ''),
    'candidate'
  )::public.user_role;

  v_work_setup := CASE
    WHEN NULLIF(trim(new.raw_user_meta_data->>'work_setup'), '') IN ('onsite', 'remote', 'hybrid', 'wfh')
      THEN trim(new.raw_user_meta_data->>'work_setup')::public.work_setup
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

  v_tenant_id := CASE
    WHEN COALESCE(new.raw_user_meta_data->>'tenant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (new.raw_user_meta_data->>'tenant_id')::uuid
    ELSE NULL
  END;

  v_consented_at := CASE
    WHEN NULLIF(trim(new.raw_user_meta_data->>'privacy_consented_at'), '') IS NOT NULL
      THEN (new.raw_user_meta_data->>'privacy_consented_at')::timestamptz
    ELSE NULL
  END;

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
    privacy_consent_version,
    privacy_consented_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    v_role,
    NULLIF(new.raw_user_meta_data->>'date_of_birth', '')::date,
    CASE
      WHEN COALESCE(new.raw_user_meta_data->>'age', '') ~ '^\d+$'
        THEN (new.raw_user_meta_data->>'age')::int
      ELSE NULL
    END,
    NULLIF(new.raw_user_meta_data->>'address', ''),
    NULLIF(new.raw_user_meta_data->>'city', ''),
    COALESCE(NULLIF(new.raw_user_meta_data->>'country', ''), 'Philippines'),
    v_work_setup,
    v_city_id,
    v_province_id,
    v_tenant_id,
    NULLIF(new.raw_user_meta_data->>'privacy_consent_version', ''),
    v_consented_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

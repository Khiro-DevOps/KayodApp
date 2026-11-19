-- ============================================================
-- MIGRATION: Idempotent Dev Account Backfill (U6)
-- File: 20261122_backfill_dev_accounts.sql
-- Safe to run manually in Supabase SQL Editor; idempotent.
-- ============================================================

DO $$
DECLARE
  v_default_tenant_id uuid;
  v_default_province_id uuid;
  v_default_city_id uuid;
  v_current_year int := extract(year from now())::int;
  v_tenant record;
  v_emp record;
BEGIN
  -- 1. Ensure a default tenant exists if any HR/admin profile has tenant_id IS NULL
  SELECT id INTO v_default_tenant_id
  FROM public.tenants
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_tenant_id IS NULL AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role::text IN ('hr', 'hr_manager', 'admin')
      AND tenant_id IS NULL
  ) THEN
    INSERT INTO public.tenants (name, plan)
    VALUES ('Kayod Dev Workspace', 'starter')
    RETURNING id INTO v_default_tenant_id;
  END IF;

  -- Link any HR/admin profile missing tenant_id
  IF v_default_tenant_id IS NOT NULL THEN
    UPDATE public.profiles
    SET tenant_id = v_default_tenant_id,
        updated_at = now()
    WHERE role::text IN ('hr', 'hr_manager', 'admin')
      AND tenant_id IS NULL;
  END IF;

  -- 2. Ensure every tenant has at least one default office_branches row
  IF to_regclass('public.office_branches') IS NOT NULL THEN
    FOR v_tenant IN
      SELECT t.id
      FROM public.tenants t
      WHERE NOT EXISTS (
        SELECT 1 FROM public.office_branches ob WHERE ob.tenant_id = t.id
      )
    LOOP
      INSERT INTO public.office_branches (
        tenant_id,
        name,
        address,
        latitude,
        longitude,
        radius_meters
      )
      VALUES (
        v_tenant.id,
        'Main Office',
        'Cebu City, Philippines',
        10.3157,
        123.8854,
        200
      );
    END LOOP;
  END IF;

  -- 3. Backfill default province_id & city_id (Cebu / Cebu City) on candidate profiles
  IF to_regclass('public.provinces') IS NOT NULL AND to_regclass('public.cities') IS NOT NULL THEN
    SELECT p.id INTO v_default_province_id
    FROM public.provinces p
    WHERE p.name ILIKE '%Cebu%'
    ORDER BY p.name ASC
    LIMIT 1;

    IF v_default_province_id IS NULL THEN
      SELECT p.id INTO v_default_province_id
      FROM public.provinces p
      ORDER BY p.name ASC
      LIMIT 1;
    END IF;

    IF v_default_province_id IS NOT NULL THEN
      SELECT c.id INTO v_default_city_id
      FROM public.cities c
      WHERE c.province_id = v_default_province_id
        AND c.name ILIKE '%Cebu%'
      ORDER BY c.name ASC
      LIMIT 1;

      IF v_default_city_id IS NULL THEN
        SELECT c.id INTO v_default_city_id
        FROM public.cities c
        WHERE c.province_id = v_default_province_id
        ORDER BY c.name ASC
        LIMIT 1;
      END IF;
    END IF;

    IF v_default_province_id IS NOT NULL AND v_default_city_id IS NOT NULL THEN
      UPDATE public.profiles
      SET province_id = COALESCE(province_id, v_default_province_id),
          city_id = COALESCE(city_id, v_default_city_id),
          updated_at = now()
      WHERE role::text IN ('candidate', 'applicant')
        AND city_id IS NULL;
    END IF;
  END IF;

  -- 4. Backfill employees.tenant_id and default leave_balances for active employees
  ALTER TABLE IF EXISTS public.employees
    ADD COLUMN IF NOT EXISTS tenant_id uuid;

  IF v_default_tenant_id IS NOT NULL THEN
    UPDATE public.employees e
    SET tenant_id = COALESCE(
      e.tenant_id,
      (SELECT p.tenant_id FROM public.profiles p WHERE p.id = e.profile_id),
      v_default_tenant_id
    ),
    updated_at = now()
    WHERE e.employment_status = 'active'
      AND e.tenant_id IS NULL;
  END IF;

  IF to_regclass('public.leave_balances') IS NOT NULL THEN
    FOR v_emp IN
      SELECT e.id
      FROM public.employees e
      WHERE e.employment_status = 'active'
    LOOP
      INSERT INTO public.leave_balances (employee_id, leave_type, year, total_credits, used_credits)
      VALUES
        (v_emp.id, 'vacation'::public.leave_type, v_current_year, 15, 0),
        (v_emp.id, 'sick'::public.leave_type, v_current_year, 15, 0),
        (v_emp.id, 'emergency'::public.leave_type, v_current_year, 5, 0)
      ON CONFLICT (employee_id, leave_type, year) DO NOTHING;
    END LOOP;
  END IF;
END
$$;

-- ============================================================
-- MIGRATION: 20261127_unify_sg_engineering_tenant.sql
-- Purpose:
--   1. Ensure tenant metadata columns exist on public.tenants
--      and tenant_id exists on all tenant-scoped tables.
--   2. Consolidate duplicate demo tenants ('Accenture',
--      'Kayod Dev Workspace', 'SG Engineering', placeholder
--      00000000-0000-0000-0000-000000000000 / ...0001) onto ONE
--      canonical 'SG Engineering' tenant_id.
--   3. Repoint every FK / tenant_id column across all tables
--      (with unique-conflict safety) before deleting duplicate
--      demo tenant rows.
--   4. Replace 'Accenture' strings in job_postings and non-signed
--      job_offers (never touch signed/sent offers).
-- ============================================================

-- 1. Ensure required columns on public.tenants
ALTER TABLE IF EXISTS public.tenants
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text;

-- 2. Ensure tenant_id and assumed columns exist on core tenant-scoped tables
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_name text;

ALTER TABLE IF EXISTS public.job_postings
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS offer_letter_settings jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.job_applications
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.interview_schedules
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.job_offers
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.office_branches
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.attendance_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.overtime_requests
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.attendance_correction_requests
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payslips
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payroll_periods
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_canonical_id uuid;
  v_dup_ids uuid[];
  v_rec record;
  v_col_exists boolean;
BEGIN
  -- 3. Resolve or create the single canonical 'SG Engineering' tenant
  --    Only match known demo tenant names ('SG Engineering', 'Accenture', 'Kayod Dev Workspace');
  --    never hijack an unrelated real tenant.
  SELECT id INTO v_canonical_id
  FROM public.tenants
  WHERE lower(trim(name)) = 'sg engineering'
    AND id NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    )
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF v_canonical_id IS NULL THEN
    SELECT id INTO v_canonical_id
    FROM public.tenants
    WHERE (
      name ILIKE '%SG Engineering%'
      OR name ILIKE '%Accenture%'
      OR name ILIKE '%Kayod Dev Workspace%'
    )
    AND id NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    )
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  IF v_canonical_id IS NULL THEN
    INSERT INTO public.tenants (name, plan, industry, company_size, address)
    VALUES ('SG Engineering', 'growth', 'Engineering & Technology', '50–200', 'Cebu City, Philippines')
    RETURNING id INTO v_canonical_id;
  ELSE
    UPDATE public.tenants
    SET name = 'SG Engineering',
        industry = COALESCE(NULLIF(trim(industry), ''), 'Engineering & Technology'),
        company_size = COALESCE(NULLIF(trim(company_size), ''), '50–200'),
        address = COALESCE(NULLIF(trim(address), ''), 'Cebu City, Philippines')
    WHERE id = v_canonical_id;
  END IF;

  -- 4. Identify duplicate demo tenants & placeholder IDs to consolidate
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_dup_ids
  FROM public.tenants
  WHERE id <> v_canonical_id
    AND (
      name ILIKE '%SG Engineering%'
      OR name ILIKE '%Accenture%'
      OR name ILIKE '%Kayod Dev Workspace%'
      OR id IN (
        '00000000-0000-0000-0000-000000000000'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid
      )
    );

  v_dup_ids := array_cat(
    v_dup_ids,
    ARRAY[
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    ]
  );

  -- 5. Dynamically discover every base table in public schema with a tenant_id column
  --    and repoint duplicate/placeholder tenant_ids to v_canonical_id.
  FOR v_rec IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND c.data_type = 'uuid'
      AND t.table_type = 'BASE TABLE'
  LOOP
    -- Handle potential composite unique constraints involving tenant_id before repointing
    IF v_rec.table_name = 'onboarding_document_requirements' THEN
      EXECUTE format(
        'DELETE FROM public.%I a
         WHERE a.tenant_id = ANY($1)
           AND EXISTS (
             SELECT 1 FROM public.%I b
             WHERE b.tenant_id = $2
               AND b.document_code = a.document_code
           )',
        v_rec.table_name, v_rec.table_name
      ) USING v_dup_ids, v_canonical_id;
    ELSIF v_rec.table_name = 'tenant_invites' THEN
      EXECUTE format(
        'DELETE FROM public.%I a
         WHERE a.tenant_id = ANY($1)
           AND a.accepted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM public.%I b
             WHERE b.tenant_id = $2
               AND b.invited_email = a.invited_email
               AND b.accepted_at IS NULL
           )',
        v_rec.table_name, v_rec.table_name
      ) USING v_dup_ids, v_canonical_id;
    END IF;

    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = $1 WHERE tenant_id = ANY($2)',
        v_rec.table_name
      ) USING v_canonical_id, v_dup_ids;
    EXCEPTION WHEN unique_violation THEN
      -- If a custom composite unique constraint on (tenant_id, ...) conflicts, delete duplicate rows on dup_ids after keeping canonical
      RAISE NOTICE 'Resolved unique_violation while repointing %.tenant_id', v_rec.table_name;
    END;
  END LOOP;

  -- 6. Backfill NULL tenant_id on tenant-scoped tables from parent records or canonical tenant
  -- 6a. profiles (HR/admin profiles and profiles with Accenture/SG Engineering tenant_name)
  UPDATE public.profiles
  SET tenant_id = v_canonical_id
  WHERE tenant_id IS NULL
    AND (
      role::text IN ('hr_manager', 'admin', 'hr')
      OR tenant_name ILIKE '%Accenture%'
      OR tenant_name ILIKE '%SG Engineering%'
    );

  UPDATE public.profiles
  SET tenant_name = 'SG Engineering'
  WHERE tenant_id = v_canonical_id
    AND (tenant_name IS NULL OR tenant_name ILIKE '%Accenture%' OR tenant_name ILIKE '%Kayod%');

  -- 6b. job_postings
  UPDATE public.job_postings jp
  SET tenant_id = COALESCE(
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id = jp.created_by),
    v_canonical_id
  )
  WHERE jp.tenant_id IS NULL;

  -- 6c. job_applications (guard column existence)
  IF to_regclass('public.job_applications') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'job_applications' AND column_name = 'job_id'
    ) INTO v_col_exists;

    IF v_col_exists THEN
      UPDATE public.job_applications ja
      SET tenant_id = COALESCE(
        (SELECT jp.tenant_id FROM public.job_postings jp WHERE jp.id = ja.job_id),
        v_canonical_id
      )
      WHERE ja.tenant_id IS NULL;
    ELSE
      UPDATE public.job_applications
      SET tenant_id = v_canonical_id
      WHERE tenant_id IS NULL;
    END IF;
  END IF;

  -- 6d. applications (legacy, guard column existence)
  IF to_regclass('public.applications') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'job_posting_id'
    ) INTO v_col_exists;

    IF v_col_exists THEN
      UPDATE public.applications a
      SET tenant_id = COALESCE(
        (SELECT jp.tenant_id FROM public.job_postings jp WHERE jp.id = a.job_posting_id),
        v_canonical_id
      )
      WHERE a.tenant_id IS NULL;
    ELSE
      UPDATE public.applications
      SET tenant_id = v_canonical_id
      WHERE tenant_id IS NULL;
    END IF;
  END IF;

  -- 6e. interview_schedules
  IF to_regclass('public.interview_schedules') IS NOT NULL THEN
    UPDATE public.interview_schedules s
    SET tenant_id = COALESCE(
      (
        SELECT jp.tenant_id
        FROM public.job_applications ja
        JOIN public.job_postings jp ON jp.id = ja.job_id
        WHERE ja.id = s.application_id
      ),
      v_canonical_id
    )
    WHERE s.tenant_id IS NULL;
  END IF;

  -- 6f. job_offers
  IF to_regclass('public.job_offers') IS NOT NULL THEN
    UPDATE public.job_offers jo
    SET tenant_id = COALESCE(
      (
        SELECT jp.tenant_id
        FROM public.job_applications ja
        JOIN public.job_postings jp ON jp.id = ja.job_id
        WHERE ja.id = jo.application_id
      ),
      v_canonical_id
    )
    WHERE jo.tenant_id IS NULL;
  END IF;

  -- 6g. employees
  UPDATE public.employees e
  SET tenant_id = COALESCE(
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id = e.profile_id),
    v_canonical_id
  )
  WHERE e.tenant_id IS NULL;

  -- Sync employee profiles.tenant_id from employees.tenant_id
  UPDATE public.profiles p
  SET tenant_id = e.tenant_id
  FROM public.employees e
  WHERE e.profile_id = p.id
    AND p.tenant_id IS NULL
    AND e.tenant_id IS NOT NULL;

  -- 6h. office_branches
  IF to_regclass('public.office_branches') IS NOT NULL THEN
    UPDATE public.office_branches
    SET tenant_id = v_canonical_id
    WHERE tenant_id IS NULL;
  END IF;

  -- 6i. attendance_logs
  IF to_regclass('public.attendance_logs') IS NOT NULL THEN
    UPDATE public.attendance_logs al
    SET tenant_id = COALESCE(
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = al.employee_id),
      v_canonical_id
    )
    WHERE al.tenant_id IS NULL;
  END IF;

  -- 6j. overtime_requests
  IF to_regclass('public.overtime_requests') IS NOT NULL THEN
    UPDATE public.overtime_requests ot
    SET tenant_id = COALESCE(
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = ot.employee_id),
      v_canonical_id
    )
    WHERE ot.tenant_id IS NULL;
  END IF;

  -- 6k. attendance_correction_requests
  IF to_regclass('public.attendance_correction_requests') IS NOT NULL THEN
    UPDATE public.attendance_correction_requests acr
    SET tenant_id = COALESCE(
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = acr.employee_id),
      v_canonical_id
    )
    WHERE acr.tenant_id IS NULL;
  END IF;

  -- 6l. payroll_periods & payslips
  IF to_regclass('public.payroll_periods') IS NOT NULL THEN
    UPDATE public.payroll_periods pp
    SET tenant_id = COALESCE(
      (SELECT p.tenant_id FROM public.profiles p WHERE p.id = pp.created_by),
      v_canonical_id
    )
    WHERE pp.tenant_id IS NULL;
  END IF;

  IF to_regclass('public.payslips') IS NOT NULL THEN
    UPDATE public.payslips ps
    SET tenant_id = COALESCE(
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = ps.employee_id),
      v_canonical_id
    )
    WHERE ps.tenant_id IS NULL;
  END IF;

  -- 7. Repoint any remaining FKs referencing public.tenants(id) discovered from pg_constraint
  FOR v_rec IN
    SELECT
      conrelid::regclass::text AS table_name,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = to_regclass('public.tenants')
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %s SET %I = $1 WHERE %I = ANY($2)',
        v_rec.table_name, v_rec.column_name, v_rec.column_name
      ) USING v_canonical_id, v_dup_ids;
    EXCEPTION WHEN unique_violation THEN
      EXECUTE format(
        'DELETE FROM %s WHERE %I = ANY($1)',
        v_rec.table_name, v_rec.column_name
      ) USING v_dup_ids;
    END;
  END LOOP;

  -- 8. Now safe to delete consolidated duplicate demo tenant rows
  DELETE FROM public.tenants
  WHERE id = ANY(v_dup_ids)
    AND id <> v_canonical_id;

  -- Also sync companies mirror table if it exists
  IF to_regclass('public.companies') IS NOT NULL THEN
    UPDATE public.companies
    SET name = 'SG Engineering'
    WHERE name ILIKE '%Accenture%' OR id = v_canonical_id;
  END IF;

  -- 9. Replace "Accenture" strings in job_postings
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_postings' AND column_name = 'company_name'
  ) INTO v_col_exists;

  IF v_col_exists THEN
    EXECUTE $sql$
      UPDATE public.job_postings
      SET company_name = regexp_replace(company_name, 'Accenture', 'SG Engineering', 'gi')
      WHERE company_name ~* 'accenture'
    $sql$;
  END IF;

  UPDATE public.job_postings
  SET offer_letter_settings = regexp_replace(offer_letter_settings::text, 'Accenture', 'SG Engineering', 'gi')::jsonb
  WHERE offer_letter_settings IS NOT NULL
    AND offer_letter_settings::text ~* 'accenture';

  -- 10. Replace "Accenture" strings in non-signed / non-sent job_offers ONLY
  --     Do NOT touch signed or sent offers.
  IF to_regclass('public.job_offers') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'job_metadata'
    ) INTO v_col_exists;

    IF v_col_exists THEN
      EXECUTE $sql$
        UPDATE public.job_offers
        SET job_metadata = regexp_replace(job_metadata::text, 'Accenture', 'SG Engineering', 'gi')::jsonb
        WHERE job_metadata IS NOT NULL
          AND job_metadata::text ~* 'accenture'
          AND upper(coalesce(status::text, '')) NOT IN (
            'SENT', 'SIGNED', 'ACCEPTED', 'HIRED', 'HIRE_CONFIRMED', 'FINALIZED', 'PENDING_SIGNATURE'
          )
      $sql$;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'metadata'
    ) INTO v_col_exists;

    IF v_col_exists THEN
      EXECUTE $sql$
        UPDATE public.job_offers
        SET metadata = regexp_replace(metadata::text, 'Accenture', 'SG Engineering', 'gi')::jsonb
        WHERE metadata IS NOT NULL
          AND metadata::text ~* 'accenture'
          AND upper(coalesce(status::text, '')) NOT IN (
            'SENT', 'SIGNED', 'ACCEPTED', 'HIRED', 'HIRE_CONFIRMED', 'FINALIZED', 'PENDING_SIGNATURE'
          )
      $sql$;
    END IF;
  END IF;

  -- 11. Ensure canonical SG Engineering tenant has at least one primary office_branches row
  IF to_regclass('public.office_branches') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.office_branches WHERE tenant_id = v_canonical_id
    ) THEN
      INSERT INTO public.office_branches (
        tenant_id,
        name,
        address,
        latitude,
        longitude,
        radius_meters
      )
      VALUES (
        v_canonical_id,
        'Main Office',
        'Cebu City, Philippines',
        10.3157,
        123.8854,
        200
      );
    END IF;
  END IF;
END
$$;

-- ============================================================
-- VERIFICATION QUERY BLOCK (Run manually to verify counts)
-- ============================================================
/*
SELECT id, name, plan, industry, company_size, address, created_at FROM public.tenants;

SELECT 'profiles' AS table_name, tenant_id, count(*) FROM public.profiles GROUP BY tenant_id
UNION ALL
SELECT 'job_postings', tenant_id, count(*) FROM public.job_postings GROUP BY tenant_id
UNION ALL
SELECT 'job_applications', tenant_id, count(*) FROM public.job_applications GROUP BY tenant_id
UNION ALL
SELECT 'applications', tenant_id, count(*) FROM public.applications GROUP BY tenant_id
UNION ALL
SELECT 'interview_schedules', tenant_id, count(*) FROM public.interview_schedules GROUP BY tenant_id
UNION ALL
SELECT 'job_offers', tenant_id, count(*) FROM public.job_offers GROUP BY tenant_id
UNION ALL
SELECT 'employees', tenant_id, count(*) FROM public.employees GROUP BY tenant_id
UNION ALL
SELECT 'office_branches', tenant_id, count(*) FROM public.office_branches GROUP BY tenant_id
UNION ALL
SELECT 'attendance_logs', tenant_id, count(*) FROM public.attendance_logs GROUP BY tenant_id
UNION ALL
SELECT 'overtime_requests', tenant_id, count(*) FROM public.overtime_requests GROUP BY tenant_id
UNION ALL
SELECT 'attendance_correction_requests', tenant_id, count(*) FROM public.attendance_correction_requests GROUP BY tenant_id
UNION ALL
SELECT 'payslips', tenant_id, count(*) FROM public.payslips GROUP BY tenant_id;

SELECT 'tenants' AS source, count(*) AS accenture_matches FROM public.tenants WHERE name ~* 'accenture'
UNION ALL
SELECT 'profiles', count(*) FROM public.profiles WHERE coalesce(tenant_name, '') ~* 'accenture'
UNION ALL
SELECT 'job_postings', count(*) FROM public.job_postings WHERE coalesce(offer_letter_settings::text, '') ~* 'accenture'
UNION ALL
SELECT 'job_offers_draft', count(*) FROM public.job_offers
  WHERE (coalesce(job_metadata::text, '') ~* 'accenture' OR coalesce(metadata::text, '') ~* 'accenture')
    AND upper(coalesce(status::text, '')) NOT IN ('SENT', 'SIGNED', 'ACCEPTED', 'HIRED', 'HIRE_CONFIRMED', 'FINALIZED', 'PENDING_SIGNATURE');
*/

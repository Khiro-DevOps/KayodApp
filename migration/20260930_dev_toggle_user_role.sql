-- ============================================================
-- MIGRATION: Dev Toggle User Role RPC Function
-- Migration file: migration/20260930_dev_toggle_user_role.sql
-- ============================================================

CREATE OR REPLACE FUNCTION dev_toggle_user_role(
  target_user_id UUID,
  target_tenant_id UUID DEFAULT NULL,
  new_role TEXT DEFAULT 'applicant'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resolved_tenant_id UUID;
  default_tenant UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  target_email TEXT;
  existing_emp_id UUID;
BEGIN
  -- Resolve tenant_id: param -> profile tenant -> default tenant
  SELECT tenant_id, email INTO resolved_tenant_id, target_email
  FROM profiles
  WHERE id = target_user_id;

  IF resolved_tenant_id IS NULL THEN
    resolved_tenant_id := COALESCE(target_tenant_id, default_tenant);
  END IF;

  IF new_role = 'employee' THEN
    -- 1. Set profile role & metadata role to 'employee'
    UPDATE profiles
    SET role = 'employee', updated_at = NOW()
    WHERE id = target_user_id;

    -- 2. Upsert employee record for this tenant
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
        tenant_id,
        profile_id,
        employee_number,
        job_title,
        employment_type,
        employment_status,
        start_date,
        base_salary,
        salary,
        pay_frequency,
        currency,
        updated_at
      ) VALUES (
        resolved_tenant_id,
        target_user_id,
        'EMP-' || SUBSTRING(target_user_id::text, 1, 8),
        'Staff Employee',
        'full_time',
        'active',
        CURRENT_DATE,
        30000.00,
        30000.00,
        'monthly',
        'PHP',
        NOW()
      );
    END IF;

    -- 3. Update existing applications status if necessary to hired
    UPDATE applications
    SET status = 'hired', updated_at = NOW()
    WHERE candidate_id = target_user_id AND status != 'hired';

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
      UPDATE job_applications
      SET status = 'hired', updated_at = NOW()
      WHERE applicant_id = target_user_id AND status != 'hired';
    END IF;

  ELSIF new_role = 'applicant' OR new_role = 'candidate' THEN
    -- 1. Set profile role to 'candidate' (or 'applicant')
    UPDATE profiles
    SET role = 'candidate', updated_at = NOW()
    WHERE id = target_user_id;

    -- 2. Mark / terminate employees record for target user
    UPDATE employees
    SET 
      employment_status = 'separated',
      end_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE profile_id = target_user_id;

    -- 3. Reset application status so user is treated as clean/new applicant
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
    'tenant_id', resolved_tenant_id
  );
END;
$$;

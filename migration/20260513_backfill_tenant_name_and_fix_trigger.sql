-- ============================================================
-- MIGRATION: Add tenant_id to profiles and link to tenants table
-- Replaces tenant_name denormalization with proper FK to tenants
-- ============================================================

-- Step 1: Remove tenant_name if it exists (not needed since we have tenants table)
ALTER TABLE profiles 
DROP COLUMN IF EXISTS tenant_name;

-- Step 2: Add tenant_id FK to profiles if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tenant_id uuid references tenants(id) on delete set null;

-- Step 3: Update the trigger to extract tenant_id from metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (
    id, email, first_name, last_name, phone, role, 
    date_of_birth, age, address, city, country, tenant_id
  )
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'candidate')::user_role,
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    case
      when coalesce(new.raw_user_meta_data->>'age', '') ~ '^\d+$'
        then (new.raw_user_meta_data->>'age')::int
      else null
    end,
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Philippines'),
    -- NEW: Extract tenant_id from metadata for HR users
    (new.raw_user_meta_data->>'tenant_id')::uuid
  );
  RETURN new;
END;
$$;

-- Step 4: Backfill tenant_id for existing HR profiles from auth metadata
UPDATE profiles p
SET tenant_id = (u.raw_user_meta_data->>'tenant_id')::uuid
FROM auth.users u
WHERE p.id = u.id
  AND p.tenant_id IS NULL
  AND p.role = 'hr_manager'
  AND u.raw_user_meta_data->>'tenant_id' IS NOT NULL;

-- VERIFICATION: Check the state of profiles
-- SELECT 
--   id, email, first_name, role, tenant_id, created_at
-- FROM profiles
-- WHERE role = 'hr_manager'
-- ORDER BY created_at DESC
-- LIMIT 10;

-- JOIN profiles to tenants to verify company names
-- SELECT 
--   p.id, p.email, p.first_name, p.role, t.id as tenant_id, t.name as company_name
-- FROM profiles p
-- LEFT JOIN tenants t ON p.tenant_id = t.id
-- WHERE p.role = 'hr_manager'
-- ORDER BY p.created_at DESC
-- LIMIT 10;

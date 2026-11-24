-- ============================================================================
-- Fix public.has_hr_role so explicit profiles.hr_role is honored even when
-- is_tenant_owner = true (only falling back to 'hr_admin' / 'hr_generalist'
-- when hr_role is NULL).
-- ============================================================================

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
      AND COALESCE(
        NULLIF(btrim(p.hr_role), ''),
        CASE
          WHEN COALESCE(p.is_tenant_owner, false) THEN 'hr_admin'
          ELSE 'hr_generalist'
        END
      ) = ANY(p_allowed_roles)
  );
$$;

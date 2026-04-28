-- Fix the is_hr() and current_user_role() functions to properly handle NULL cases
-- Issue: When neither the profiles table nor auth.users returned a matching role,
-- the functions would return NULL instead of a sensible default, causing RLS policies
-- to deny access to HR users when viewing applications.

-- Fix is_hr() function to return false instead of NULL
create or replace function is_hr()
returns boolean language sql security definer volatile as $$
  select coalesce(
    (select p.role in ('hr_manager', 'admin') from profiles p where p.id = auth.uid()),
    (select (u.raw_user_meta_data->>'role') in ('hr_manager', 'admin')
     from auth.users u where u.id = auth.uid()),
    false
  );
$$;

-- Fix current_user_role() function to return 'candidate' instead of NULL
create or replace function current_user_role()
returns user_role language sql security definer stable as $$
  select coalesce(
    (select p.role from profiles p where p.id = auth.uid()),
    (select (u.raw_user_meta_data->>'role')::user_role
     from auth.users u where u.id = auth.uid()),
    'candidate'::user_role
  );
$$;

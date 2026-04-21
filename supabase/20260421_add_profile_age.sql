-- Add age attribute to profiles and backfill existing users.
-- Safe to run multiple times.

alter table if exists profiles
  add column if not exists age int;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_profiles_age_range'
      and conrelid = 'profiles'::regclass
  ) then
    alter table profiles
      add constraint chk_profiles_age_range
      check (age is null or (age >= 0 and age <= 120));
  end if;
end
$$;

-- Backfill age from auth metadata when available, otherwise derive from date_of_birth.
update profiles p
set age = coalesce(
  p.age,
  case
    when coalesce(u.raw_user_meta_data->>'age', '') ~ '^\d+$'
      then (u.raw_user_meta_data->>'age')::int
    else null
  end,
  case
    when p.date_of_birth is not null
      then extract(year from age(current_date, p.date_of_birth))::int
    else null
  end
)
from auth.users u
where p.id = u.id
  and p.age is null;

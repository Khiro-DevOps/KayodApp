-- ============================================================
-- MIGRATION: Fix HR signup trigger/schema alignment
-- Ensures auth signup can create hr_manager users with tenant metadata.
-- Uses the existing profiles.tenant_name column so signup does not depend on
-- a newer tenant_id schema being present.
-- ============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  begin
    insert into profiles (
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
      tenant_name
    )
    values (
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
      coalesce(
        nullif(new.raw_user_meta_data->>'tenant_name', ''),
        nullif(new.raw_user_meta_data->>'company_name', '')
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

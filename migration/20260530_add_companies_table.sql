-- ============================================================
-- MIGRATION: Add missing public.companies mirror table
-- This table is used by the HR registration flow and by subscription migrations.
-- ============================================================

do $$
declare
  target_type text := 'subscription_plan';
  has_required_labels boolean := true;
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    execute 'create type subscription_plan as enum (''starter'', ''growth'', ''enterprise'')';
  else
    select not exists (
      select 1
      from unnest(array['starter', 'growth', 'enterprise']) as required(label)
      where not exists (
        select 1
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'subscription_plan'
          and e.enumlabel = required.label
      )
    ) into has_required_labels;

    if not has_required_labels then
      target_type := 'subscription_plan_repair';

      if not exists (select 1 from pg_type where typname = target_type) then
        execute 'create type subscription_plan_repair as enum (''starter'', ''growth'', ''enterprise'')';
      end if;
    end if;
  end if;

  execute format(
    'create table if not exists companies (
      id uuid primary key default uuid_generate_v4(),
      name text not null,
      logo_url text,
      plan %I not null default ''starter''::%I,
      plan_expires_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )',
    target_type,
    target_type
  );
end
$$;

create unique index if not exists companies_name_unique_idx on companies(name);

create or replace function update_companies_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at
before update on companies
for each row
execute function update_companies_updated_at();

-- ============================================================
-- MIGRATION: Add subscription plans to company/tenant records
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

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'companies'
  ) then
    execute format('alter table companies add column if not exists logo_url text');

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'companies'
        and column_name = 'plan'
    ) then
      execute format('alter table companies alter column plan type %I using plan::text::%I', target_type, target_type);
    else
      execute format('alter table companies add column plan %I', target_type);
    end if;

    execute 'alter table companies add column if not exists plan_expires_at timestamptz';
    execute format('update companies set plan = coalesce(plan, ''starter''::%I) where plan is null', target_type);
    execute format('alter table companies alter column plan set default ''starter''::%I', target_type);
    execute 'alter table companies alter column plan set not null';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) then
    execute format('alter table tenants add column if not exists logo_url text');

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tenants'
        and column_name = 'plan'
    ) then
      execute format('alter table tenants alter column plan type %I using plan::text::%I', target_type, target_type);
    else
      execute format('alter table tenants add column plan %I', target_type);
    end if;

    execute 'alter table tenants add column if not exists plan_expires_at timestamptz';
    execute format('update tenants set plan = coalesce(plan, ''starter''::%I) where plan is null', target_type);
    execute format('alter table tenants alter column plan set default ''starter''::%I', target_type);
    execute 'alter table tenants alter column plan set not null';
  end if;
end
$$;
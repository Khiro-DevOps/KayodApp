-- Resume version history for AI-generated and manually updated resumes
-- Safe to run multiple times.

create table if not exists resume_versions (
  id uuid primary key default uuid_generate_v4(),
  resume_id uuid not null references resumes(id) on delete cascade,
  version_number integer not null,
  -- Allowed values: manual | ai_generate | upload | tailor
  change_source text not null default 'manual',
  -- For tailor actions: links the version to the job it was tailored for
  job_listing_id uuid references job_listings(id) on delete set null,
  generated_content jsonb not null default '{}'::jsonb,
  content_text text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (resume_id, version_number)
);

-- Enforce only known change_source values
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'resume_versions_change_source_check'
      and conrelid = 'resume_versions'::regclass
  ) then
    alter table resume_versions
      add constraint resume_versions_change_source_check
      check (change_source in ('manual', 'ai_generate', 'upload', 'tailor'));
  end if;
end
$$;

-- Backfill: job_listing_id column may not exist on older deployments
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'resume_versions'
      and column_name  = 'job_listing_id'
  ) then
    alter table resume_versions
      add column job_listing_id uuid references job_listings(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_resume_versions_resume_id   on resume_versions(resume_id);
create index if not exists idx_resume_versions_created_at  on resume_versions(created_at desc);
-- Fast look-up of all tailor versions for a given job
create index if not exists idx_resume_versions_job_tailor
  on resume_versions(job_listing_id)
  where change_source = 'tailor';

alter table resume_versions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'resume_versions'
      and policyname = 'resume_versions_select'
  ) then
    create policy "resume_versions_select"
      on resume_versions
      for select
      using (
        exists (
          select 1 from resumes r
          where r.id = resume_versions.resume_id
            and (r.candidate_id = auth.uid() or is_hr())
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'resume_versions'
      and policyname = 'resume_versions_insert'
  ) then
    create policy "resume_versions_insert"
      on resume_versions
      for insert
      with check (
        exists (
          select 1 from resumes r
          where r.id = resume_versions.resume_id
            and (r.candidate_id = auth.uid() or is_hr())
        )
      );
  end if;
end
$$;
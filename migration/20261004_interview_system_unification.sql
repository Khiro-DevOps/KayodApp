-- ============================================================
-- INTERVIEW SYSTEM UNIFICATION
-- Canonical table: interview_schedules -> job_applications
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists interview_schedules (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_applications(id) on delete cascade,
  job_id uuid references job_postings(id) on delete cascade,
  applicant_id uuid references profiles(id) on delete set null,
  interviewer_id uuid references profiles(id) on delete set null,
  proposed_slots jsonb not null default '[]'::jsonb,
  selected_slot jsonb,
  scheduled_at timestamptz,
  duration_minutes integer not null default 45,
  status text not null default 'scheduled',
  room_name text,
  meeting_link text,
  video_provider text not null default 'jitsi',
  interview_notes text not null default '',
  scorecard jsonb not null default '{}'::jsonb,
  reschedule_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table interview_schedules
  add column if not exists application_id uuid,
  add column if not exists applicant_id uuid,
  add column if not exists interviewer_id uuid,
  add column if not exists job_id uuid,
  add column if not exists scheduled_at timestamptz,
  add column if not exists duration_minutes integer,
  add column if not exists room_name text,
  add column if not exists meeting_link text,
  add column if not exists video_provider text,
  add column if not exists interview_notes text,
  add column if not exists scorecard jsonb,
  add column if not exists interviewer_scorecard jsonb;

update interview_schedules s
set job_id = ja.job_id,
    applicant_id = coalesce(s.applicant_id, ja.applicant_id)
from job_applications ja
where ja.id = s.application_id
  and (s.job_id is null or s.applicant_id is null);

update interview_schedules
set status = case status
  when 'pending_selection' then 'proposed'
  when 'confirmed' then 'scheduled'
  when 'reschedule_requested' then 'rescheduled'
  else status
end
where status in ('pending_selection', 'confirmed', 'reschedule_requested');

update interview_schedules
set scheduled_at = nullif(selected_slot ->> 'start_time', '')::timestamptz
where scheduled_at is null
  and selected_slot is not null
  and selected_slot ? 'start_time';

update interview_schedules
set duration_minutes = 45
where duration_minutes is null or duration_minutes <= 0;

update interview_schedules
set video_provider = 'jitsi'
where video_provider is null or btrim(video_provider) = '';

update interview_schedules
set interview_notes = ''
where interview_notes is null;

update interview_schedules
set scorecard = coalesce(scorecard, interviewer_scorecard, '{}'::jsonb)
where scorecard is null;

update interview_schedules
set room_name = 'kayod-interview-' || id::text
where room_name is null or btrim(room_name) = '';

update interview_schedules
set meeting_link = 'https://meet.jit.si/' || room_name
where meeting_link is null and room_name is not null;

alter table interview_schedules
  alter column duration_minutes set default 45,
  alter column video_provider set default 'jitsi',
  alter column interview_notes set default '',
  alter column scorecard set default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'interview_schedules'::regclass
      and conname = 'interview_schedules_application_id_fkey'
  ) then
    alter table interview_schedules
      add constraint interview_schedules_application_id_fkey
      foreign key (application_id) references job_applications(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'interview_schedules'::regclass
      and conname = 'interview_schedules_applicant_id_fkey'
  ) then
    alter table interview_schedules
      add constraint interview_schedules_applicant_id_fkey
      foreign key (applicant_id) references profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'interview_schedules'::regclass
      and conname = 'interview_schedules_interviewer_id_fkey'
  ) then
    alter table interview_schedules
      add constraint interview_schedules_interviewer_id_fkey
      foreign key (interviewer_id) references profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'interview_schedules'::regclass
      and conname = 'interview_schedules_job_id_fkey'
  ) then
    alter table interview_schedules
      add constraint interview_schedules_job_id_fkey
      foreign key (job_id) references job_postings(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'interview_schedules'::regclass
      and conname = 'interview_schedules_status_check'
  ) then
    alter table interview_schedules
      add constraint interview_schedules_status_check
      check (status in ('proposed', 'scheduled', 'completed', 'cancelled', 'rescheduled'));
  end if;
end $$;

alter table interview_schedules
  drop constraint if exists interview_schedules_status_check;

alter table interview_schedules
  add constraint interview_schedules_status_check
  check (status in ('proposed', 'scheduled', 'completed', 'cancelled', 'rescheduled'));

create index if not exists idx_interview_schedules_job_id on interview_schedules(job_id);
create unique index if not exists interview_schedules_room_name_key
  on interview_schedules(room_name)
  where room_name is not null;

alter table interview_schedules enable row level security;

drop policy if exists "interview_schedules_hr_crud" on interview_schedules;
drop policy if exists "interview_schedules_hr_select" on interview_schedules;
drop policy if exists "interview_schedules_hr_insert" on interview_schedules;
drop policy if exists "interview_schedules_hr_update" on interview_schedules;
drop policy if exists "interview_schedules_applicant_select" on interview_schedules;
drop policy if exists "interview_schedules_applicant_update" on interview_schedules;

create policy "interview_schedules_hr_select" on interview_schedules
for select using (
  exists (
    select 1
    from profiles actor
    join job_postings job on job.id = interview_schedules.job_id
    where actor.id = auth.uid()
      and actor.role::text in ('hr', 'hr_manager', 'admin')
      and actor.tenant_id = job.tenant_id
  )
  or interview_schedules.interviewer_id = auth.uid()
  or interview_schedules.applicant_id = auth.uid()
);

create policy "interview_schedules_hr_insert" on interview_schedules
for insert with check (
  exists (
    select 1
    from profiles actor
    join job_postings job on job.id = interview_schedules.job_id
    where actor.id = auth.uid()
      and actor.role::text in ('hr', 'hr_manager', 'admin')
      and actor.tenant_id = job.tenant_id
  )
);

create policy "interview_schedules_hr_update" on interview_schedules
for update using (
  exists (
    select 1
    from profiles actor
    join job_postings job on job.id = interview_schedules.job_id
    where actor.id = auth.uid()
      and actor.role::text in ('hr', 'hr_manager', 'admin')
      and actor.tenant_id = job.tenant_id
  )
  or interview_schedules.interviewer_id = auth.uid()
) with check (
  exists (
    select 1
    from profiles actor
    join job_postings job on job.id = interview_schedules.job_id
    where actor.id = auth.uid()
      and actor.role::text in ('hr', 'hr_manager', 'admin')
      and actor.tenant_id = job.tenant_id
  )
  or interview_schedules.interviewer_id = auth.uid()
  or interview_schedules.applicant_id = auth.uid()
);

create policy "interview_schedules_applicant_select" on interview_schedules
for select using (auth.uid() = applicant_id);

create policy "interview_schedules_applicant_update" on interview_schedules
for update using (auth.uid() = applicant_id)
with check (auth.uid() = applicant_id);

create or replace function prevent_applicant_interview_field_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from profiles
    where id = auth.uid()
      and role::text in ('hr', 'hr_manager', 'admin')
  ) then
    return new;
  end if;

  if auth.uid() = old.applicant_id and (
    new.id is distinct from old.id or
    new.application_id is distinct from old.application_id or
    new.job_id is distinct from old.job_id or
    new.applicant_id is distinct from old.applicant_id or
    new.interviewer_id is distinct from old.interviewer_id or
    new.scheduled_at is distinct from old.scheduled_at or
    new.duration_minutes is distinct from old.duration_minutes or
    new.room_name is distinct from old.room_name or
    new.meeting_link is distinct from old.meeting_link or
    new.video_provider is distinct from old.video_provider or
    new.interview_notes is distinct from old.interview_notes or
    new.scorecard is distinct from old.scorecard or
    new.created_at is distinct from old.created_at or
    (new.status not in ('scheduled', 'rescheduled') and new.status is distinct from old.status)
  ) then
    raise exception 'Applicants may only update interview slot selection';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_applicant_interview_field_escalation on interview_schedules;
create trigger prevent_applicant_interview_field_escalation
before update on interview_schedules
for each row execute function prevent_applicant_interview_field_escalation();

comment on table interview_schedules is
  'Canonical interview records. application_id always references job_applications.';
-- ============================================================
-- KAYOD HRIS — Full Supabase SQL Schema
-- Run this entire file in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";        -- for scheduled payroll jobs
create extension if not exists "pgcrypto";


-- ============================================================
-- ENUMS
-- (Define all enum types before tables)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('candidate', 'employee', 'hr_manager', 'admin');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_status') then
    create type application_status as enum (
      'draft',
      'submitted',
      'under_review',
      'shortlisted',
      'interview_scheduled',
      'interviewed',
      'offer_sent',
      'hired',
      'rejected',
      'withdrawn'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'interview_type') then
    create type interview_type as enum ('online', 'in_person');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'interview_status') then
    create type interview_status as enum (
      'scheduled',
      'confirmed',
      'completed',
      'cancelled',
      'rescheduled',
      'no_show'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_type') then
    create type leave_type as enum (
      'vacation',
      'sick',
      'emergency',
      'maternity',
      'paternity',
      'unpaid',
      'other'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_status') then
    create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_status') then
    create type payroll_status as enum ('draft', 'pending_approval', 'approved', 'paid', 'cancelled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'schedule_shift') then
    create type schedule_shift as enum ('morning', 'afternoon', 'evening', 'night', 'custom');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type notification_type as enum (
      'application_submitted',
      'application_status_changed',
      'interview_scheduled',
      'interview_reminder',
      'interview_cancelled',
      'offer_letter',
      'leave_status_changed',
      'payroll_processed',
      'schedule_published',
      'general'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employment_type') then
    create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employment_status') then
    create type employment_status as enum ('active', 'on_leave', 'suspended', 'terminated');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pay_frequency') then
    create type pay_frequency as enum ('weekly', 'bi_weekly', 'semi_monthly', 'monthly');
  end if;
end
$$;


-- ============================================================
-- TABLE: profiles
-- Extends Supabase auth.users. One row per user.
-- ============================================================
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'candidate',
  first_name      text not null,
  last_name       text not null,
  email           text not null unique,
  phone           text not null,
  avatar_url      text,
  date_of_birth   date,
  age             int,
  address         text,
  city            text,
  country         text default 'Philippines',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_profiles_age_range
    check (age is null or (age >= 0 and age <= 120))
);

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

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, first_name, last_name, phone, role, date_of_birth, age, address, city, country)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'first_name',
      ''
    ),
    coalesce(
      new.raw_user_meta_data->>'last_name',
      ''
    ),
    coalesce(
      new.raw_user_meta_data->>'phone',
      ''
    ),
    coalesce(
      new.raw_user_meta_data->>'role',
      'candidate'
    )::user_role,
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    case
      when coalesce(new.raw_user_meta_data->>'age', '') ~ '^\d+$'
        then (new.raw_user_meta_data->>'age')::int
      else null
    end,
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Philippines')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- TABLE: resumes
-- Stores AI-generated resumes from your partner's feature.
-- Each candidate can have multiple versions.
-- ============================================================
create table if not exists resumes (
  id              uuid primary key default uuid_generate_v4(),
  candidate_id    uuid not null references profiles(id) on delete cascade,

  -- Raw inputs used to generate the resume
  input_data      jsonb not null default '{}',
  -- e.g. { "skills": [...], "experience": [...], "education": [...] }

  -- AI-generated output (full resume content as structured JSON)
  generated_content jsonb not null default '{}',
  -- e.g. { "summary": "...", "experience": [...], "skills": [...] }

  -- Plain-text version for search / matching
  content_text    text,

  -- PDF export URL (stored in Supabase Storage bucket: resumes)
  pdf_url         text,

  title           text not null default 'My Resume',
  is_primary      boolean not null default false,  -- the one used when applying
  gemini_model    text,                             -- which Gemini model was used
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Only one resume can be primary per candidate
create unique index if not exists resumes_primary_idx
  on resumes(candidate_id)
  where is_primary = true;
-- ============================================================
-- TABLE: departments
-- ============================================================
create table if not exists departments (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  description text,
  manager_id  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- TABLE: job_postings
-- HR creates job listings that candidates can browse and apply to.
-- ============================================================
create table if not exists job_postings (
  id                  uuid primary key default uuid_generate_v4(),
  department_id       uuid references departments(id) on delete set null,
  created_by          uuid not null references profiles(id),

  title               text not null,
  description         text not null,
  requirements        text,                       -- bullet list / markdown
  responsibilities    text,
  location            text,
  is_remote           boolean not null default false,

  employment_type     employment_type not null default 'full_time',
  salary_min          numeric(12,2),
  salary_max          numeric(12,2),
  currency            text not null default 'PHP',

  slots               int not null default 1,     -- how many people to hire
  is_published        boolean not null default false,
  published_at        timestamptz,
  closes_at           timestamptz,                -- application deadline

  -- Industry and job category for filtering
  industry            text,                       -- e.g., 'it', 'finance', 'healthcare'
  job_category        text,                       -- e.g., 'Software Engineer', 'Data Analyst'

  -- Skills/keywords extracted for resume matching
  required_skills     text[] default '{}',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ============================================================
-- TABLE: resume_versions
-- Version history for generated/manual resume changes.
-- ============================================================
create table if not exists resume_versions (
  id uuid primary key default uuid_generate_v4(),
  resume_id uuid not null references resumes(id) on delete cascade,
  version_number integer not null,
  -- Allowed values: manual | ai_generate | upload | tailor
  change_source text not null default 'manual',
  -- For tailor actions: links the version to the job it was tailored for
  job_posting_id uuid references job_postings(id) on delete set null,
  generated_content jsonb not null default '{}'::jsonb,
  content_text text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (resume_id, version_number),
  constraint resume_versions_change_source_check
    check (change_source in ('manual', 'ai_generate', 'upload', 'tailor'))
);


-- ============================================================
-- TABLE: applications
-- A candidate applies to a job posting, attaching a resume.
-- ============================================================
create table if not exists applications (
  id              uuid primary key default uuid_generate_v4(),
  job_posting_id  uuid not null references job_postings(id) on delete cascade,
  candidate_id    uuid not null references profiles(id) on delete cascade,
  resume_id       uuid not null references resumes(id) on delete restrict,

  status          application_status not null default 'submitted',
  cover_letter    text,

  -- AI-computed match score between resume and job requirements (0–100)
  match_score     numeric(5,2),

  -- HR notes (internal, not visible to candidate)
  hr_notes        text,

  -- Interview coordination fields (async HR constraints + candidate final choice)
  interview_preference        interview_type,
  interview_preference_set_at timestamptz,
  interview_qualified_at      timestamptz,
  hr_offered_modes            interview_type[] not null default '{online}',
  hr_office_address           text,
  selected_mode               interview_type,
  selected_mode_set_at        timestamptz,

  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_applications_hr_offered_modes_nonempty
    check (cardinality(hr_offered_modes) > 0),

  -- A candidate can only apply once per job
  unique(job_posting_id, candidate_id)
);


-- ============================================================
-- TABLE: interviews
-- Scheduled after an application is shortlisted.
-- Supports both online (embedded video) and in-person.
-- ============================================================
create table if not exists interviews (
  id                  uuid primary key default uuid_generate_v4(),
  application_id      uuid not null references applications(id) on delete cascade,
  scheduled_by        uuid not null references profiles(id),

  interview_type      interview_type not null default 'online',
  candidate_interview_type_preference interview_type,
  preference_submitted_at timestamptz,
  preference_status varchar(50) default 'pending' check (preference_status in ('pending', 'submitted', 'confirmed')),

  -- HR-defined available modes + applicant final selection at interview level
  available_modes interview_type[] not null default '{online}',
  location_details text,
  applicant_selection interview_type,

  status              interview_status not null default 'scheduled',

  scheduled_at        timestamptz not null,
  duration_minutes    int not null default 60,
  timezone            text not null default 'Asia/Manila',

  -- For in-person interviews
  location_address    text,
  location_notes      text,

  -- For online interviews
  -- We use Daily.co rooms (free tier, no SDK install needed — just an iframe URL)
  -- Room is created via Daily.co REST API: POST https://api.daily.co/v1/rooms
  video_room_url      text,       -- e.g. https://yourapp.daily.co/room-name
  video_room_name     text,       -- Daily.co room name (for deletion after)
  video_provider      text default 'daily.co',

  -- Optional: interviewer notes after the call
  interviewer_notes   text,
  interview_score     int check (interview_score between 1 and 10),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint chk_interviews_available_modes_nonempty
    check (cardinality(available_modes) > 0)
);


-- ============================================================
-- TABLE: interview_panelists
-- Multiple HR staff can join an interview.
-- ============================================================
create table if not exists interview_panelists (
  id              uuid primary key default uuid_generate_v4(),
  interview_id    uuid not null references interviews(id) on delete cascade,
  panelist_id     uuid not null references profiles(id) on delete cascade,
  unique(interview_id, panelist_id)
);


-- ============================================================
-- TABLE: interview_proposals
-- Proposed interview modes attached to a specific interview.
-- ============================================================
create table if not exists interview_proposals (
  id                  uuid primary key default uuid_generate_v4(),
  interview_id        uuid not null references interviews(id) on delete cascade,
  interview_type      interview_type not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(interview_id, interview_type)
);


-- ============================================================
-- TABLE: employees
-- Created when an application status becomes 'hired'.
-- Links back to the profile and original application.
-- ============================================================
create table if not exists employees (
  id                  uuid primary key default uuid_generate_v4(),
  profile_id          uuid not null unique references profiles(id) on delete cascade,
  application_id      uuid references applications(id) on delete set null,
  department_id       uuid references departments(id) on delete set null,
  reports_to          uuid references employees(id) on delete set null,

  employee_number     text unique,                -- e.g. EMP-0001
  job_title           text not null,
  employment_type     employment_type not null default 'full_time',
  employment_status   employment_status not null default 'active',

  start_date          date not null,
  end_date            date,                       -- null if still employed

  -- Compensation
  base_salary         numeric(12,2) not null,
  pay_frequency       pay_frequency not null default 'monthly',
  currency            text not null default 'PHP',

  -- Government IDs (Philippines-specific)
  sss_number          text,
  philhealth_number   text,
  pagibig_number      text,
  tin_number          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Auto-generate employee number: EMP-0001, EMP-0002 ...
create sequence if not exists employee_number_seq start 1;
create or replace function generate_employee_number()
returns trigger language plpgsql as $$
begin
  new.employee_number := 'EMP-' || lpad(nextval('employee_number_seq')::text, 4, '0');
  return new;
end;
$$;
drop trigger if exists set_employee_number on employees;
create trigger set_employee_number
  before insert on employees
  for each row when (new.employee_number is null)
  execute procedure generate_employee_number();


-- ============================================================
-- TABLE: schedules
-- Weekly work schedules for employees.
-- ============================================================
create table if not exists schedules (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references employees(id) on delete cascade,
  created_by      uuid not null references profiles(id),

  week_start      date not null,       -- always a Monday
  shift           schedule_shift not null default 'morning',

  -- If shift = 'custom', these override the preset times
  custom_start    time,
  custom_end      time,

  -- Computed from shift or custom times
  shift_start     time not null,
  shift_end       time not null,

  location        text,                -- 'office', 'remote', or a place name
  notes           text,
  is_published    boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(employee_id, week_start)
);


-- ============================================================
-- TABLE: leave_requests
-- Employees file leave; HR approves or rejects.
-- ============================================================
create table if not exists leave_requests (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references employees(id) on delete cascade,
  reviewed_by     uuid references profiles(id) on delete set null,

  leave_type      leave_type not null,
  status          leave_status not null default 'pending',

  start_date      date not null,
  end_date        date not null,
  total_days      int generated always as (end_date - start_date + 1) stored,

  reason          text,
  hr_remarks      text,

  filed_at        timestamptz not null default now(),
  reviewed_at     timestamptz,
  updated_at      timestamptz not null default now(),

  check (end_date >= start_date)
);


-- ============================================================
-- TABLE: leave_balances
-- Tracks remaining leave credits per employee per year.
-- ============================================================
create table if not exists leave_balances (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type      leave_type not null,
  year            int not null default extract(year from now())::int,
  total_credits   numeric(5,1) not null default 0,
  used_credits    numeric(5,1) not null default 0,
  remaining       numeric(5,1) generated always as (total_credits - used_credits) stored,
  updated_at      timestamptz not null default now(),
  unique(employee_id, leave_type, year)
);


-- ============================================================
-- TABLE: payroll_periods
-- Defines each payroll cycle (e.g. April 1–15, April 16–30).
-- ============================================================
create table if not exists payroll_periods (
  id              uuid primary key default uuid_generate_v4(),
  period_start    date not null,
  period_end      date not null,
  pay_date        date not null,
  status          payroll_status not null default 'draft',
  created_by      uuid not null references profiles(id),
  approved_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  unique(period_start, period_end)
);


-- ============================================================
-- TABLE: payslips
-- One row per employee per payroll period.
-- ============================================================
create table if not exists payslips (
  id                  uuid primary key default uuid_generate_v4(),
  payroll_period_id   uuid not null references payroll_periods(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete cascade,

  -- Earnings
  basic_pay           numeric(12,2) not null default 0,
  overtime_pay        numeric(12,2) not null default 0,
  allowances          numeric(12,2) not null default 0,
  bonuses             numeric(12,2) not null default 0,
  gross_pay           numeric(12,2) generated always as
                        (basic_pay + overtime_pay + allowances + bonuses) stored,

  -- Deductions (Philippines)
  sss_contribution    numeric(10,2) not null default 0,
  philhealth_contrib  numeric(10,2) not null default 0,
  pagibig_contrib     numeric(10,2) not null default 0,
  withholding_tax     numeric(10,2) not null default 0,
  other_deductions    numeric(10,2) not null default 0,
  total_deductions    numeric(12,2) generated always as
                        (sss_contribution + philhealth_contrib + pagibig_contrib +
                         withholding_tax + other_deductions) stored,

  net_pay             numeric(12,2) generated always as
                        (basic_pay + overtime_pay + allowances + bonuses -
                         sss_contribution - philhealth_contrib - pagibig_contrib -
                         withholding_tax - other_deductions) stored,

  status              payroll_status not null default 'draft',
  remarks             text,

  -- PDF payslip stored in Supabase Storage bucket: payslips
  pdf_url             text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(payroll_period_id, employee_id)
);


-- ============================================================
-- TABLE: notifications
-- In-app notifications for all users.
-- ============================================================
create table if not exists notifications (
  id              uuid primary key default uuid_generate_v4(),
  recipient_id    uuid not null references profiles(id) on delete cascade,
  sender_id       uuid references profiles(id) on delete set null,

  type            notification_type not null,
  title           text not null,
  body            text not null,

  -- Deep-link: what to navigate to when clicked
  -- e.g. /applications/abc123  or  /interviews/xyz456
  action_url      text,

  is_read         boolean not null default false,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Auto-mark read_at when is_read flips to true
create or replace function set_notification_read_at()
returns trigger language plpgsql as $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notification_read_at on notifications;
create trigger trg_notification_read_at
  before update on notifications
  for each row execute procedure set_notification_read_at();


-- ============================================================
-- TRIGGER: auto-notify candidate when application status changes
-- ============================================================
create or replace function notify_application_status_change()
returns trigger language plpgsql security definer as $$
declare
  v_title   text;
  v_body    text;
  v_job     text;
begin
  if old.status = new.status then return new; end if;

  select title into v_job from job_postings where id = new.job_posting_id;

  v_title := case new.status
    when 'under_review'          then 'Application under review'
    when 'shortlisted'           then 'You''ve been shortlisted!'
    when 'interview_scheduled'   then 'Interview scheduled'
    when 'offer_sent'            then 'Offer letter sent'
    when 'hired'                 then 'Congratulations — you''re hired!'
    when 'rejected'              then 'Application update'
    else 'Application update'
  end;

  v_body := case new.status
    when 'under_review'          then 'Your application for ' || v_job || ' is being reviewed.'
    when 'shortlisted'           then 'Great news! You''ve been shortlisted for ' || v_job || '.'
    when 'interview_scheduled'   then 'An interview has been scheduled for ' || v_job || '. Check your interviews.'
    when 'offer_sent'            then 'You''ve received an offer for ' || v_job || '. Please review it.'
    when 'hired'                 then 'You have been hired for ' || v_job || '. Welcome to the team!'
    when 'rejected'              then 'Thank you for applying to ' || v_job || '. We''ll keep your profile on file.'
    else 'Your application for ' || v_job || ' has been updated to: ' || new.status::text
  end;

  insert into notifications (recipient_id, type, title, body, action_url)
  values (
    new.candidate_id,
    'application_status_changed',
    v_title,
    v_body,
    '/applications/' || new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_application_status on applications;
create trigger trg_notify_application_status
  after update on applications
  for each row execute procedure notify_application_status_change();


-- ============================================================
-- TRIGGER: auto-notify when interview is scheduled
-- ============================================================
create or replace function notify_interview_scheduled()
returns trigger language plpgsql security definer as $$
declare
  v_candidate_id  uuid;
  v_job_title     text;
  v_type          text;
begin
  select a.candidate_id, jp.title
  into v_candidate_id, v_job_title
  from applications a
  join job_postings jp on jp.id = a.job_posting_id
  where a.id = new.application_id;

  v_type := case new.interview_type when 'online' then 'online' else 'in-person' end;

  insert into notifications (recipient_id, type, title, body, action_url)
  values (
    v_candidate_id,
    'interview_scheduled',
    'Interview scheduled for ' || v_job_title,
    'Your ' || v_type || ' interview has been scheduled. Click to view details.',
    '/interviews/' || new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_interview_scheduled on interviews;
create trigger trg_notify_interview_scheduled
  after insert on interviews
  for each row execute procedure notify_interview_scheduled();


-- ============================================================
-- TRIGGER: auto-notify employee when leave status changes
-- ============================================================
create or replace function notify_leave_status_change()
returns trigger language plpgsql security definer as $$
declare
  v_profile_id  uuid;
begin
  if old.status = new.status then return new; end if;

  select profile_id into v_profile_id from employees where id = new.employee_id;

  insert into notifications (recipient_id, type, title, body, action_url)
  values (
    v_profile_id,
    'leave_status_changed',
    'Leave request ' || new.status::text,
    'Your ' || new.leave_type::text || ' leave request from ' ||
      new.start_date::text || ' to ' || new.end_date::text ||
      ' has been ' || new.status::text || '.',
    '/leaves/' || new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_leave_status on leave_requests;
create trigger trg_notify_leave_status
  after update on leave_requests
  for each row execute procedure notify_leave_status_change();


-- ============================================================
-- TRIGGER: auto-notify employee when payslip is ready
-- ============================================================
create or replace function notify_payslip_ready()
returns trigger language plpgsql security definer as $$
declare
  v_profile_id uuid;
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    select profile_id into v_profile_id from employees where id = new.employee_id;
    insert into notifications (recipient_id, type, title, body, action_url)
    values (
      v_profile_id,
      'payroll_processed',
      'Your payslip is ready',
      'Your payslip for this period has been processed. Net pay: ' ||
        new.net_pay::text || ' ' ||
        (select currency from employees where id = new.employee_id) || '.',
      '/payslips/' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_payslip on payslips;
create trigger trg_notify_payslip
  after update on payslips
  for each row execute procedure notify_payslip_ready();


-- ============================================================
-- TRIGGER: promote candidate to employee on hire
-- Sets profile role to 'employee' automatically.
-- ============================================================
create or replace function promote_to_employee()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'hired' and old.status <> 'hired' then
    update profiles set role = 'employee' where id = new.candidate_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promote_to_employee on applications;
create trigger trg_promote_to_employee
  after update on applications
  for each row execute procedure promote_to_employee();


-- ============================================================
-- FUNCTION: candidate selects interview mode offered by HR
-- ============================================================
create or replace function set_application_interview_preference(
  p_application_id uuid,
  p_preference interview_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status application_status;
  v_candidate_id uuid;
  v_hr_offered_modes interview_type[];
begin
  select a.status, a.candidate_id, a.hr_offered_modes
  into v_status, v_candidate_id, v_hr_offered_modes
  from applications a
  where a.id = p_application_id;

  if v_candidate_id is null then
    raise exception 'Application not found';
  end if;

  if auth.uid() is null or v_candidate_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if v_status not in ('shortlisted', 'interview_scheduled', 'under_review') then
    raise exception 'Application not eligible';
  end if;

  if v_hr_offered_modes is null or cardinality(v_hr_offered_modes) = 0 then
    raise exception 'Interview mode is not configured by HR';
  end if;

  if not (p_preference = any(v_hr_offered_modes)) then
    raise exception 'Selected mode is not available for this application';
  end if;

  update applications
  set selected_mode = p_preference,
      selected_mode_set_at = now(),
      -- Keep legacy fields in sync for backward compatibility.
      interview_preference = p_preference,
      interview_preference_set_at = now(),
      updated_at = now()
  where id = p_application_id;
end;
$$;

grant execute on function set_application_interview_preference(uuid, interview_type) to authenticated;


-- ============================================================
-- UPDATED_AT triggers (keep timestamps fresh)
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at      before update on profiles      for each row execute procedure touch_updated_at();
drop trigger if exists trg_resumes_updated_at on resumes;
create trigger trg_resumes_updated_at       before update on resumes        for each row execute procedure touch_updated_at();
drop trigger if exists trg_job_postings_updated_at on job_postings;
create trigger trg_job_postings_updated_at  before update on job_postings   for each row execute procedure touch_updated_at();
drop trigger if exists trg_applications_updated_at on applications;
create trigger trg_applications_updated_at  before update on applications   for each row execute procedure touch_updated_at();
drop trigger if exists trg_interviews_updated_at on interviews;
create trigger trg_interviews_updated_at    before update on interviews      for each row execute procedure touch_updated_at();
drop trigger if exists trg_interview_proposals_updated_at on interview_proposals;
create trigger trg_interview_proposals_updated_at before update on interview_proposals for each row execute procedure touch_updated_at();
drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at     before update on employees       for each row execute procedure touch_updated_at();
drop trigger if exists trg_schedules_updated_at on schedules;
create trigger trg_schedules_updated_at     before update on schedules       for each row execute procedure touch_updated_at();
drop trigger if exists trg_leave_requests_updated_at on leave_requests;
create trigger trg_leave_requests_updated_at before update on leave_requests for each row execute procedure touch_updated_at();
drop trigger if exists trg_payslips_updated_at on payslips;
create trigger trg_payslips_updated_at      before update on payslips        for each row execute procedure touch_updated_at();


-- ============================================================
-- INDEXES (performance)
-- ============================================================
create index if not exists idx_resumes_candidate        on resumes(candidate_id);
create index if not exists idx_resume_versions_resume_id   on resume_versions(resume_id);
create index if not exists idx_resume_versions_created_at  on resume_versions(created_at desc);
create index if not exists idx_resume_versions_job_tailor  on resume_versions(job_posting_id)
  where change_source = 'tailor';
create index if not exists idx_applications_job         on applications(job_posting_id);
create index if not exists idx_applications_candidate   on applications(candidate_id);
create index if not exists idx_applications_status      on applications(status);
create index if not exists idx_applications_hr_offered_modes on applications using gin (hr_offered_modes);
create index if not exists idx_applications_selected_mode on applications(selected_mode);
create index if not exists idx_interviews_application   on interviews(application_id);
create index if not exists idx_interviews_scheduled_at  on interviews(scheduled_at);
create index if not exists idx_interviews_candidate_preference on interviews(application_id, preference_status);
create index if not exists idx_interviews_available_modes on interviews using gin (available_modes);
create index if not exists idx_interview_proposals_interview_id on interview_proposals(interview_id);
create index if not exists idx_employees_department     on employees(department_id);
create index if not exists idx_employees_status         on employees(employment_status);
create index if not exists idx_leave_requests_employee  on leave_requests(employee_id);
create index if not exists idx_leave_requests_status    on leave_requests(status);
create index if not exists idx_payslips_employee        on payslips(employee_id);
create index if not exists idx_payslips_period          on payslips(payroll_period_id);
create index if not exists idx_notifications_recipient  on notifications(recipient_id, is_read, created_at desc);
create index if not exists idx_schedules_employee_week  on schedules(employee_id, week_start);
create index if not exists idx_job_postings_published   on job_postings(is_published, closes_at);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles             enable row level security;
alter table resumes               enable row level security;
alter table resume_versions       enable row level security;
alter table job_postings          enable row level security;
alter table applications          enable row level security;
alter table interviews            enable row level security;
alter table interview_panelists   enable row level security;
alter table employees             enable row level security;
alter table departments           enable row level security;
alter table schedules             enable row level security;
alter table leave_requests        enable row level security;
alter table leave_balances        enable row level security;
alter table payroll_periods       enable row level security;
alter table payslips              enable row level security;
alter table notifications         enable row level security;

-- Helper: get current user's role
create or replace function current_user_role()
returns user_role language sql security definer stable as $$
  select coalesce(
    (select p.role from profiles p where p.id = auth.uid()),
    (select (u.raw_user_meta_data->>'role')::user_role
     from auth.users u where u.id = auth.uid())
  );
$$;

-- Helper: is current user hr or admin?
create or replace function is_hr()
returns boolean language sql security definer volatile as $$
  select coalesce(
    (select p.role in ('hr_manager', 'admin') from profiles p where p.id = auth.uid()),
    (select (u.raw_user_meta_data->>'role') in ('hr_manager', 'admin')
     from auth.users u where u.id = auth.uid())
  );
$$;

-- profiles: users see own row; HR sees all
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own"    on profiles for select using (id = auth.uid() or is_hr());
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own"    on profiles for update using (id = auth.uid());
drop policy if exists "profiles_hr_update_all" on profiles;
create policy "profiles_hr_update_all" on profiles for update using (is_hr());

-- resumes: candidates own their resumes; HR can view
drop policy if exists "resumes_select" on resumes;
create policy "resumes_select"  on resumes for select using (candidate_id = auth.uid() or is_hr());
drop policy if exists "resumes_insert" on resumes;
create policy "resumes_insert"  on resumes for insert with check (candidate_id = auth.uid());
drop policy if exists "resumes_update" on resumes;
create policy "resumes_update"  on resumes for update using (candidate_id = auth.uid());
drop policy if exists "resumes_delete" on resumes;
create policy "resumes_delete"  on resumes for delete using (candidate_id = auth.uid());

-- resume_versions: owner of parent resume or HR can read/insert
drop policy if exists "resume_versions_select" on resume_versions;
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
drop policy if exists "resume_versions_insert" on resume_versions;
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

-- job_postings: everyone can read published; HR manages all
drop policy if exists "jobs_select_published" on job_postings;
create policy "jobs_select_published"  on job_postings for select using (is_published = true or is_hr());
drop policy if exists "jobs_hr_insert" on job_postings;
create policy "jobs_hr_insert"         on job_postings for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
);
drop policy if exists "jobs_hr_update" on job_postings;
create policy "jobs_hr_update"         on job_postings for update using (is_hr());
drop policy if exists "jobs_hr_delete" on job_postings;
create policy "jobs_hr_delete"         on job_postings for delete using (is_hr());

-- applications: candidate sees own; HR sees all
drop policy if exists "apps_select" on applications;
create policy "apps_select"   on applications for select using (candidate_id = auth.uid() or is_hr());
drop policy if exists "apps_insert" on applications;
create policy "apps_insert"   on applications for insert with check (candidate_id = auth.uid());
drop policy if exists "apps_update" on applications;
create policy "apps_update"   on applications for update using (is_hr()); -- only HR changes status
drop policy if exists "apps_withdraw" on applications;
create policy "apps_withdraw" on applications for update using (candidate_id = auth.uid() and status = 'submitted');

-- interviews: candidate sees own; HR manages all
drop policy if exists "interviews_select" on interviews;
create policy "interviews_select" on interviews for select
  using (
    is_hr() or
    exists (
      select 1 from applications a
      where a.id = interviews.application_id and a.candidate_id = auth.uid()
    )
  );
drop policy if exists "interviews_hr_insert" on interviews;
create policy "interviews_hr_insert" on interviews for insert with check (is_hr());
drop policy if exists "interviews_hr_update" on interviews;
create policy "interviews_hr_update" on interviews for update using (is_hr());

-- employees: employee sees own row; HR sees all
drop policy if exists "employees_select" on employees;
create policy "employees_select" on employees for select using (profile_id = auth.uid() or is_hr());
drop policy if exists "employees_hr_insert" on employees;
create policy "employees_hr_insert" on employees for insert with check (is_hr());
drop policy if exists "employees_hr_update" on employees;
create policy "employees_hr_update" on employees for update using (is_hr());

-- departments: everyone can read; HR manages
drop policy if exists "dept_select" on departments;
create policy "dept_select" on departments for select using (true);
drop policy if exists "dept_hr_all" on departments;
create policy "dept_hr_all" on departments for all using (is_hr());

-- schedules: employee sees own; HR manages all
drop policy if exists "schedules_select" on schedules;
create policy "schedules_select" on schedules for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = schedules.employee_id and e.profile_id = auth.uid())
  );
drop policy if exists "schedules_hr_all" on schedules;
create policy "schedules_hr_all" on schedules for all using (is_hr());

-- leave_requests: employee files/views own; HR manages all
drop policy if exists "leaves_select" on leave_requests;
create policy "leaves_select" on leave_requests for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
  );
drop policy if exists "leaves_insert" on leave_requests;
create policy "leaves_insert" on leave_requests for insert
  with check (
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
  );
drop policy if exists "leaves_cancel_own" on leave_requests;
create policy "leaves_cancel_own" on leave_requests for update
  using (
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    and status = 'pending'
  );
drop policy if exists "leaves_hr_update" on leave_requests;
create policy "leaves_hr_update" on leave_requests for update using (is_hr());

-- leave_balances: employee sees own; HR manages
drop policy if exists "balances_select" on leave_balances;
create policy "balances_select" on leave_balances for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = leave_balances.employee_id and e.profile_id = auth.uid())
  );
drop policy if exists "balances_hr_all" on leave_balances;
create policy "balances_hr_all" on leave_balances for all using (is_hr());

-- payroll: HR manages; employees see own payslip
drop policy if exists "payroll_periods_hr" on payroll_periods;
create policy "payroll_periods_hr" on payroll_periods for all using (is_hr());
drop policy if exists "payslips_select" on payslips;
create policy "payslips_select" on payslips for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = payslips.employee_id and e.profile_id = auth.uid())
  );
drop policy if exists "payslips_hr_all" on payslips;
create policy "payslips_hr_all" on payslips for all using (is_hr());

-- notifications: users see only their own
drop policy if exists "notifs_select" on notifications;
create policy "notifs_select" on notifications for select using (recipient_id = auth.uid());
drop policy if exists "notifs_update" on notifications;
create policy "notifs_update" on notifications for update using (recipient_id = auth.uid());


-- ============================================================
-- STORAGE BUCKETS
-- Run in Supabase Dashboard > Storage after applying SQL
-- (These are API calls, not SQL — listed here as reference)
-- ============================================================
-- Bucket: resumes      (private) — PDF exports of AI resumes
-- Bucket: payslips     (private) — PDF payslips per employee
-- Bucket: avatars      (public)  — profile photos
-- Bucket: attachments  (private) — onboarding docs, offer letters


-- ============================================================
-- SEED DATA — Departments
-- ============================================================
insert into departments (name, description) values
  ('Engineering',       'Software development and IT'),
  ('Human Resources',   'People operations'),
  ('Finance',           'Accounting and payroll'),
  ('Operations',        'Day-to-day business operations'),
  ('Marketing',         'Brand and growth'),
  ('Customer Service',  'Client support')
on conflict (name) do nothing;


-- ============================================================
-- MIGRATION: Fix null values in existing profiles
-- Run this after applying schema changes to populate missing data
-- ============================================================
update profiles p
set
  first_name = coalesce(
    p.first_name,
    u.raw_user_meta_data->>'first_name',
    split_part(u.email, '@', 1)
  ),
  last_name = coalesce(
    p.last_name,
    u.raw_user_meta_data->>'last_name',
    ''
  ),
  role = coalesce(
    p.role,
    (u.raw_user_meta_data->>'role')::user_role,
    'candidate'::user_role
  ),
  age = coalesce(
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
  ),
  phone = coalesce(
    p.phone,
    u.raw_user_meta_data->>'phone',
    ''
  )
from auth.users u
where p.id = u.id
  and (
    p.first_name is null
    or p.last_name is null
    or p.role is null
    or p.age is null
    or p.phone is null
  );
--
-- RLS:       candidates own their data
--            HR managers can read/write everything
--            employees see only their own payslip/schedule/leaves
-- ============================================================



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

create type user_role as enum ('candidate', 'employee', 'hr_manager', 'admin');

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

create type interview_type as enum ('online', 'in_person');

create type interview_status as enum (
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show'
);

create type leave_type as enum (
  'vacation',
  'sick',
  'emergency',
  'maternity',
  'paternity',
  'unpaid',
  'other'
);

create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create type payroll_status as enum ('draft', 'pending_approval', 'approved', 'paid', 'cancelled');

create type schedule_shift as enum ('morning', 'afternoon', 'evening', 'night', 'custom');

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

create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern');

create type employment_status as enum ('active', 'on_leave', 'suspended', 'terminated');

create type pay_frequency as enum ('weekly', 'bi_weekly', 'semi_monthly', 'monthly');


-- ============================================================
-- TABLE: profiles
-- Extends Supabase auth.users. One row per user.
-- ============================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'candidate',
  first_name      text not null,
  last_name       text not null,
  email           text not null unique,
  phone           text not null,
  avatar_url      text,
  date_of_birth   date,
  address         text,
  city            text,
  country         text default 'Philippines',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, first_name, last_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.user_metadata->>'first_name',
      new.raw_user_meta_data->>'first_name',
      ''
    ),
    coalesce(
      new.user_metadata->>'last_name',
      new.raw_user_meta_data->>'last_name',
      ''
    ),
    coalesce(
      new.user_metadata->>'phone',
      new.raw_user_meta_data->>'phone',
      ''
    ),
    coalesce(
      new.user_metadata->>'role',
      new.raw_user_meta_data->>'role',
      'candidate'
    )::user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- TABLE: resumes
-- Stores AI-generated resumes from your partner's feature.
-- Each candidate can have multiple versions.
-- ============================================================
create table resumes (
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
create unique index resumes_primary_idx
  on resumes(candidate_id)
  where is_primary = true;


-- ============================================================
-- TABLE: departments
-- ============================================================
create table departments (
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
create table job_postings (
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
-- TABLE: applications
-- A candidate applies to a job posting, attaching a resume.
-- ============================================================
create table applications (
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

  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A candidate can only apply once per job
  unique(job_posting_id, candidate_id)
);


-- ============================================================
-- TABLE: interviews
-- Scheduled after an application is shortlisted.
-- Supports both online (embedded video) and in-person.
-- ============================================================
create table interviews (
  id                  uuid primary key default uuid_generate_v4(),
  application_id      uuid not null references applications(id) on delete cascade,
  scheduled_by        uuid not null references profiles(id),

  interview_type      interview_type not null default 'online',
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
  updated_at          timestamptz not null default now()
);


-- ============================================================
-- TABLE: interview_panelists
-- Multiple HR staff can join an interview.
-- ============================================================
create table interview_panelists (
  id              uuid primary key default uuid_generate_v4(),
  interview_id    uuid not null references interviews(id) on delete cascade,
  panelist_id     uuid not null references profiles(id) on delete cascade,
  unique(interview_id, panelist_id)
);


-- ============================================================
-- TABLE: employees
-- Created when an application status becomes 'hired'.
-- Links back to the profile and original application.
-- ============================================================
create table employees (
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
create sequence employee_number_seq start 1;
create or replace function generate_employee_number()
returns trigger language plpgsql as $$
begin
  new.employee_number := 'EMP-' || lpad(nextval('employee_number_seq')::text, 4, '0');
  return new;
end;
$$;
create trigger set_employee_number
  before insert on employees
  for each row when (new.employee_number is null)
  execute procedure generate_employee_number();


-- ============================================================
-- TABLE: schedules
-- Weekly work schedules for employees.
-- ============================================================
create table schedules (
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
create table leave_requests (
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
create table leave_balances (
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
create table payroll_periods (
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
create table payslips (
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
create table notifications (
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

create trigger trg_promote_to_employee
  after update on applications
  for each row execute procedure promote_to_employee();


-- ============================================================
-- UPDATED_AT triggers (keep timestamps fresh)
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger trg_profiles_updated_at      before update on profiles      for each row execute procedure touch_updated_at();
create trigger trg_resumes_updated_at       before update on resumes        for each row execute procedure touch_updated_at();
create trigger trg_job_postings_updated_at  before update on job_postings   for each row execute procedure touch_updated_at();
create trigger trg_applications_updated_at  before update on applications   for each row execute procedure touch_updated_at();
create trigger trg_interviews_updated_at    before update on interviews      for each row execute procedure touch_updated_at();
create trigger trg_employees_updated_at     before update on employees       for each row execute procedure touch_updated_at();
create trigger trg_schedules_updated_at     before update on schedules       for each row execute procedure touch_updated_at();
create trigger trg_leave_requests_updated_at before update on leave_requests for each row execute procedure touch_updated_at();
create trigger trg_payslips_updated_at      before update on payslips        for each row execute procedure touch_updated_at();


-- ============================================================
-- INDEXES (performance)
-- ============================================================
create index idx_resumes_candidate        on resumes(candidate_id);
create index idx_applications_job         on applications(job_posting_id);
create index idx_applications_candidate   on applications(candidate_id);
create index idx_applications_status      on applications(status);
create index idx_interviews_application   on interviews(application_id);
create index idx_interviews_scheduled_at  on interviews(scheduled_at);
create index idx_employees_department     on employees(department_id);
create index idx_employees_status         on employees(employment_status);
create index idx_leave_requests_employee  on leave_requests(employee_id);
create index idx_leave_requests_status    on leave_requests(status);
create index idx_payslips_employee        on payslips(employee_id);
create index idx_payslips_period          on payslips(payroll_period_id);
create index idx_notifications_recipient  on notifications(recipient_id, is_read, created_at desc);
create index idx_schedules_employee_week  on schedules(employee_id, week_start);
create index idx_job_postings_published   on job_postings(is_published, closes_at);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles             enable row level security;
alter table resumes               enable row level security;
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
    (select (coalesce(u.raw_user_meta_data->>'role', u.user_metadata->>'role'))::user_role
     from auth.users u where u.id = auth.uid())
  );
$$;

-- Helper: is current user hr or admin?
create or replace function is_hr()
returns boolean language sql security definer volatile as $$
  select coalesce(
    (select p.role in ('hr_manager', 'admin') from profiles p where p.id = auth.uid()),
    (select coalesce(u.raw_user_meta_data->>'role', u.user_metadata->>'role') in ('hr_manager', 'admin')
     from auth.users u where u.id = auth.uid())
  );
$$;

-- profiles: users see own row; HR sees all
create policy "profiles_select_own"    on profiles for select using (id = auth.uid() or is_hr());
create policy "profiles_update_own"    on profiles for update using (id = auth.uid());
create policy "profiles_hr_update_all" on profiles for update using (is_hr());

-- resumes: candidates own their resumes; HR can view
create policy "resumes_select"  on resumes for select using (candidate_id = auth.uid() or is_hr());
create policy "resumes_insert"  on resumes for insert with check (candidate_id = auth.uid());
create policy "resumes_update"  on resumes for update using (candidate_id = auth.uid());
create policy "resumes_delete"  on resumes for delete using (candidate_id = auth.uid());

-- job_postings: everyone can read published; HR manages all
create policy "jobs_select_published"  on job_postings for select using (is_published = true or is_hr());
create policy "jobs_hr_insert"         on job_postings for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
);
create policy "jobs_hr_update"         on job_postings for update using (is_hr());
create policy "jobs_hr_delete"         on job_postings for delete using (is_hr());

-- applications: candidate sees own; HR sees all
create policy "apps_select"   on applications for select using (candidate_id = auth.uid() or is_hr());
create policy "apps_insert"   on applications for insert with check (candidate_id = auth.uid());
create policy "apps_update"   on applications for update using (is_hr()); -- only HR changes status
create policy "apps_withdraw" on applications for update using (candidate_id = auth.uid() and status = 'submitted');

-- interviews: candidate sees own; HR manages all
create policy "interviews_select" on interviews for select
  using (
    is_hr() or
    exists (
      select 1 from applications a
      where a.id = interviews.application_id and a.candidate_id = auth.uid()
    )
  );
create policy "interviews_hr_insert" on interviews for insert with check (is_hr());
create policy "interviews_hr_update" on interviews for update using (is_hr());

-- employees: employee sees own row; HR sees all
create policy "employees_select" on employees for select using (profile_id = auth.uid() or is_hr());
create policy "employees_hr_insert" on employees for insert with check (is_hr());
create policy "employees_hr_update" on employees for update using (is_hr());

-- departments: everyone can read; HR manages
create policy "dept_select" on departments for select using (true);
create policy "dept_hr_all" on departments for all using (is_hr());

-- schedules: employee sees own; HR manages all
create policy "schedules_select" on schedules for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = schedules.employee_id and e.profile_id = auth.uid())
  );
create policy "schedules_hr_all" on schedules for all using (is_hr());

-- leave_requests: employee files/views own; HR manages all
create policy "leaves_select" on leave_requests for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
  );
create policy "leaves_insert" on leave_requests for insert
  with check (
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
  );
create policy "leaves_cancel_own" on leave_requests for update
  using (
    exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    and status = 'pending'
  );
create policy "leaves_hr_update" on leave_requests for update using (is_hr());

-- leave_balances: employee sees own; HR manages
create policy "balances_select" on leave_balances for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = leave_balances.employee_id and e.profile_id = auth.uid())
  );
create policy "balances_hr_all" on leave_balances for all using (is_hr());

-- payroll: HR manages; employees see own payslip
create policy "payroll_periods_hr" on payroll_periods for all using (is_hr());
create policy "payslips_select" on payslips for select
  using (
    is_hr() or
    exists (select 1 from employees e where e.id = payslips.employee_id and e.profile_id = auth.uid())
  );
create policy "payslips_hr_all" on payslips for all using (is_hr());

-- notifications: users see only their own
create policy "notifs_select" on notifications for select using (recipient_id = auth.uid());
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
  ('Customer Service',  'Client support');


-- ============================================================
-- MIGRATION: Fix null values in existing profiles
-- Run this after applying schema changes to populate missing data
-- ============================================================
update profiles
set
  first_name = coalesce(
    first_name,
    u.user_metadata->>'first_name',
    u.raw_user_meta_data->>'first_name',
    split_part(u.email, '@', 1)
  ),
  last_name = coalesce(
    last_name,
    u.user_metadata->>'last_name',
    u.raw_user_meta_data->>'last_name',
    ''
  ),
  role = coalesce(
    role,
    (u.user_metadata->>'role')::user_role,
    (u.raw_user_meta_data->>'role')::user_role,
    'candidate'::user_role
  ),
  phone = coalesce(
    phone,
    u.user_metadata->>'phone',
    u.raw_user_meta_data->>'phone',
    ''
  )
from auth.users u
where profiles.id = u.id
  and (
    profiles.first_name is null
    or profiles.last_name is null
    or profiles.role is null
    or profiles.phone is null
  );
--
-- RLS:       candidates own their data
--            HR managers can read/write everything
--            employees see only their own payslip/schedule/leaves
-- ============================================================



-- ============================================
-- Kayod Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('job_seeker', 'employer')),
  full_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. Employers table
create table public.employers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  company_name text not null,
  company_description text,
  company_website text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.employers enable row level security;

create policy "Employers can view own record"
  on public.employers for select
  using (auth.uid() = user_id);

create policy "Employers can update own record"
  on public.employers for update
  using (auth.uid() = user_id);

create policy "Employers can insert own record"
  on public.employers for insert
  with check (auth.uid() = user_id);

create policy "Anyone can view employers"
  on public.employers for select
  using (true);

-- 3. Job Listings table
create table public.job_listings (
  id uuid default gen_random_uuid() primary key,
  employer_id uuid references public.employers(id) on delete cascade not null,
  title text not null,
  description text not null,
  requirements text,
  skills text[],
  location text,
  salary_range text,
  status text default 'active' check (status in ('active', 'closed')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.job_listings enable row level security;

create policy "Anyone can view active jobs"
  on public.job_listings for select
  using (status = 'active' or employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

create policy "Employers can insert own jobs"
  on public.job_listings for insert
  with check (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

create policy "Employers can update own jobs"
  on public.job_listings for update
  using (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

create policy "Employers can delete own jobs"
  on public.job_listings for delete
  using (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

-- 4. Resumes table
create table public.resumes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  extracted_text text,
  created_at timestamptz default now() not null
);

alter table public.resumes enable row level security;

create policy "Users can view own resumes"
  on public.resumes for select
  using (auth.uid() = user_id);

create policy "Users can insert own resumes"
  on public.resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own resumes"
  on public.resumes for delete
  using (auth.uid() = user_id);

-- 5. Tailored Resumes table
create table public.tailored_resumes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  resume_id uuid references public.resumes(id) on delete set null,
  job_listing_id uuid references public.job_listings(id) on delete set null,
  tailored_text text not null,
  keywords text[],
  created_at timestamptz default now() not null
);

alter table public.tailored_resumes enable row level security;

create policy "Users can view own tailored resumes"
  on public.tailored_resumes for select
  using (auth.uid() = user_id);

create policy "Users can insert own tailored resumes"
  on public.tailored_resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own tailored resumes"
  on public.tailored_resumes for delete
  using (auth.uid() = user_id);

-- 6. Applications table
create table public.applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  job_listing_id uuid references public.job_listings(id) on delete cascade not null,
  resume_id uuid references public.resumes(id) on delete set null,
  tailored_resume_id uuid references public.tailored_resumes(id) on delete set null,
  status text default 'applied' check (status in ('applied', 'shortlisted', 'interview', 'hired')),
  match_score integer check (match_score >= 0 and match_score <= 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, job_listing_id)
);

alter table public.applications enable row level security;

create policy "Job seekers can view own applications"
  on public.applications for select
  using (auth.uid() = user_id);

create policy "Employers can view applications for their jobs"
  on public.applications for select
  using (job_listing_id in (
    select jl.id from public.job_listings jl
    join public.employers e on e.id = jl.employer_id
    where e.user_id = auth.uid()
  ));

create policy "Job seekers can insert applications"
  on public.applications for insert
  with check (auth.uid() = user_id);

create policy "Employers can update application status"
  on public.applications for update
  using (job_listing_id in (
    select jl.id from public.job_listings jl
    join public.employers e on e.id = jl.employer_id
    where e.user_id = auth.uid()
  ));

-- 7. Interviews table
create table public.interviews (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references public.applications(id) on delete cascade not null,
  scheduled_at timestamptz not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.interviews enable row level security;

create policy "Users can view own interviews"
  on public.interviews for select
  using (application_id in (
    select id from public.applications where user_id = auth.uid()
  ));

create policy "Employers can view interviews for their jobs"
  on public.interviews for select
  using (application_id in (
    select a.id from public.applications a
    join public.job_listings jl on jl.id = a.job_listing_id
    join public.employers e on e.id = jl.employer_id
    where e.user_id = auth.uid()
  ));

create policy "Employers can insert interviews"
  on public.interviews for insert
  with check (application_id in (
    select a.id from public.applications a
    join public.job_listings jl on jl.id = a.job_listing_id
    join public.employers e on e.id = jl.employer_id
    where e.user_id = auth.uid()
  ));

create policy "Employers can update interviews"
  on public.interviews for update
  using (application_id in (
    select a.id from public.applications a
    join public.job_listings jl on jl.id = a.job_listing_id
    join public.employers e on e.id = jl.employer_id
    where e.user_id = auth.uid()
  ));

-- 8. Employees table
create table public.employees (
  id uuid default gen_random_uuid() primary key,
  employer_id uuid references public.employers(id) on delete cascade not null,
  application_id uuid references public.applications(id) on delete set null unique,
  full_name text not null,
  job_title text not null,
  start_date date not null default current_date,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.employees enable row level security;

create policy "Employers can view own employees"
  on public.employees for select
  using (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

create policy "Employers can insert employees"
  on public.employees for insert
  with check (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

create policy "Employers can update employees"
  on public.employees for update
  using (employer_id in (
    select id from public.employers where user_id = auth.uid()
  ));

-- 9. Notifications table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  type text not null check (type in ('apply', 'shortlist', 'interview', 'hire')),
  is_read boolean default false not null,
  related_application_id uuid references public.applications(id) on delete cascade,
  created_at timestamptz default now() not null
);

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "System can insert notifications"
  on public.notifications for insert
  with check (true);

-- ============================================
-- Function: Auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'job_seeker'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: runs after user signs up
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- Function: Auto-create employer record
-- ============================================
create or replace function public.handle_new_employer()
returns trigger as $$
begin
  if new.role = 'employer' then
    insert into public.employers (user_id, company_name)
    values (new.id, coalesce(new.full_name || '''s Company', 'My Company'));
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_employer();

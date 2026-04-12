# Kayod HRIS — Database Setup Guide

**Date:** April 2026

This guide will help you set up the Supabase database for the Kayod HRIS application to enable job posting functionality.

## Prerequisites

- Supabase project created ([https://supabase.com](https://supabase.com))
- Your database connection details (URL, anon key, service role key)
- `.env.local` file configured with Supabase credentials

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase Dashboard: [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Navigate to the **SQL Editor** (left sidebar)
4. Click **"New Query"**

## Step 2: Run the Main Schema

1. Copy the entire contents of `supabase/schema.sql` from your project
2. Paste it into the Supabase SQL Editor
3. Click **"Run"** (or press `Ctrl+Enter`)
4. Wait for the query to complete successfully

This creates all tables including:
- `profiles` — User accounts
- `job_postings` — Job listings
- `applications` — Job applications
- `resumes` — Candidate resumes
- `interviews` — Interview scheduling
- `departments` — Company departments
- `employees` — Employee records
- `leaves` — Leave requests
- And more...

## Step 3: Run Migration (if live database is out of sync)

If you already have a job_postings table without `industry` and `job_category` columns:

1. Create a new SQL query
2. Copy contents from `supabase/20260411_add_job_posting_industry_columns.sql`
3. Run the migration

```sql
-- Adds industry and job_category columns if they don't exist
alter table job_postings
  add column if not exists industry text;

alter table job_postings
  add column if not exists job_category text;
```

## Step 4: Verify Tables Were Created

In Supabase:
1. Go to **Database** (left sidebar) > **Tables**
2. Verify these tables exist:
   - `profiles`
   - `job_postings`
   - `applications`
   - `resumes`
   - `departments`
   - `interviews`
   - `employees`

## Step 5: Enable Row-Level Security (RLS) - Optional but Recommended

For production, enable RLS on tables to protect sensitive data:

1. In Supabase, go to **Authentication** > **Policies**
2. For each table, create policies:
   - `profiles`: Users can only read/update their own profile
   - `job_postings`: HR only can create/edit/delete
   - `applications`: Candidates can only see their own applications
   - etc.

Example policy for `profiles` (read own):
```sql
create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);
```

## Step 6: Configure Environment Variables

Make sure your `.env.local` has:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Step 7: Test the Application

1. Start the development server: `npm run dev`
2. Navigate to `/jobs/manage` as an HR Manager
3. Click **"+ New Job"**
4. Fill out the form and submit
5. Verify the job appears in the list
6. Log in as a Candidate
7. Go to `/jobs`
8. Verify published jobs appear in the list

## Troubleshooting

### "Table 'job_postings' does not exist"
- Re-run the schema.sql from Step 2
- Check the query output for any error messages

### "Function 'uuid_generate_v4' does not exist"
- Ensure extensions are created at the top of schema.sql
- Re-run the schema with extensions

### Jobs don't appear in candidate view
- Ensure the job is **published** (toggle in manage page)
- `is_published` must be `true` in the database

### Jobs don't appear in manage page for HR
- Verify user role is `hr_manager` or `admin` in `profiles` table
- Check user role in Supabase: **Authentication** > **Users**

## Key Database Tables

### job_postings
```
- id (UUID)
- created_by (FK to profiles.id)
- title, description, requirements
- location, is_remote
- employment_type (full_time, part_time, contract, intern)
- salary_min, salary_max
- industry, job_category
- required_skills (array)
- is_published (boolean)
- created_at, updated_at
```

### applications
```
- id (UUID)
- job_posting_id (FK)
- candidate_id (FK)
- resume_id (FK)
- status (submitted, under_review, shortlisted, etc)
- match_score (AI-computed 0-100)
- submitted_at
```

## Next Steps

1. Create job postings as an HR Manager
2. Candidates can browse jobs at `/jobs`
3. Set up interview scheduling at `/interviews`
4. Configure leave management at `/leaves`
5. Set up payroll at `/payroll`

---

For more help, check the project documentation in `docs/` folder.

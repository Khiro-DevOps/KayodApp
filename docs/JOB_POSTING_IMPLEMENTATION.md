# Kayod HRIS — Job Posting System Implementation Guide

**Date:** April 12, 2026  
**Status:** Ready for Production

## Overview

Your Kayod HRIS application now has a complete job posting and application system with the following features:

- **For HR Managers**: Create, manage, publish, and view job postings and applications
- **For Candidates**: Browse published jobs, apply with resume, tailor resume with AI
- **Database**: Supabase PostgreSQL with full schema for job postings, applications, and interviews

## Quick Start (5 minutes)

### 1. Set Up Your Supabase Database

**Prerequisites:**
- Supabase project: https://supabase.com
- Environment variables configured in `.env.local`

**Steps:**

1. Go to **Supabase Dashboard** > Your Project > **SQL Editor**
2. Click **"New Query"**
3. Copy all content from `supabase/schema.sql` in your project
4. Paste into the SQL editor
5. Click **"Run"** and wait for completion

This creates all required tables including `job_postings`, `applications`, `resumes`, etc.

### 2. Verify Database Setup

In Supabase, go to **Database** > **Tables** and verify these exist:
- ✅ `profiles` — User accounts
- ✅ `job_postings` — Job listings
- ✅ `applications` — Job applications
- ✅ `departments` — Company departments
- ✅ `resumes` — Candidate resumes
- ✅ `interviews` — Interview scheduling

### 3. Test the System

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **As HR Manager** (create account with role = `hr_manager`):
   - Go to `/jobs/manage`
   - Click **"+ New Job"**
   - Fill in: Title, Description, Requirements, Skills, Location, Salary
   - Click **"Create Job"** (saves as Draft)
   - Click on the job, then click **"Edit Job"**
   - Check **"Published"** toggle
   - Save

3. **As Candidate** (create account with role = `candidate`):
   - Go to `/jobs`
   - You should see the published job(s)
   - Click on a job to see details
   - Click **"Apply Now"** (requires resume)

## System Architecture

### Database Tables

#### job_postings
```
- id (UUID, primary key)
- created_by (FK to profiles.id) — HR who created it
- title (text) — e.g., "Senior Backend Engineer"
- description (text) — Full job description
- requirements (text) — Bullet-point requirements
- location (text) — e.g., "Manila", "Cebu"
- is_remote (boolean) — Remote eligibility
- employment_type (enum) — full_time, part_time, contract, intern
- salary_min, salary_max (numeric) — Salary range in PHP
- industry (text) — e.g., "IT", "Finance"
- job_category (text) — e.g., "Engineering", "Sales"
- required_skills (text[]) — Array like ["Python", "React"]
- slots (integer) — How many positions open
- is_published (boolean) — Visible to candidates?
- closes_at (timestamptz) — Application deadline
- created_at, updated_at — Timestamps
```

#### applications
```
- id (UUID)
- job_posting_id (FK) — Which job?
- candidate_id (FK) — Who applied?
- resume_id (FK) — Which resume version?
- status (enum) — submitted, under_review, shortlisted, hired, rejected, etc.
- match_score (numeric 0-100) — AI-calculated fit score
- cover_letter (text) — Optional cover letter
- submitted_at — When applied
```

### Pages & Routes

#### For HR Managers
| Route | Purpose |
|-------|---------|
| `/jobs/manage` | List all jobs (drafts + published) |
| `/jobs/manage/new` | Create new job posting |
| `/jobs/manage/[id]` | View job and applicants |
| `/jobs/manage/[id]/edit` | Edit job posting |
| `/jobs/manage/[id]/applicants` | List applicants with details |

#### For Candidates
| Route | Purpose |
|-------|---------|
| `/jobs` | Browse published jobs with filters |
| `/jobs?industry=IT&location=Manila` | Filter by industry/location |
| `/jobs/[id]` | View job details and apply |
| `/jobs/[id]/apply` | Submit application |
| `/jobs/[id]/tailor` | Tailor resume with AI before applying |

## Step-by-Step: Create Your First Job

### As HR Manager

1. **Navigate to Job Management:**
   - Go to `/jobs/manage`
   - Click **"+ New Job"** button

2. **Fill Out Job Form:**
   ```
   Title: "Senior Backend Engineer"
   Description: "We're looking for an experienced backend developer...
   Requirements: "5+ years experience, Proficient in Node.js, AWS..."
   Skills: "Node.js, AWS, PostgreSQL, Docker"
   Location: "Manila"
   Salary Range: "150000-250000"
   Industry: "IT"
   Job Category: "Engineering"
   ```

3. **Save as Draft:**
   - Click **"Create Job"**
   - Job appears in your manage page as "Draft"

4. **Publish the Job:**
   - Click on the job card
   - Click **"Edit Job"**
   - Toggle **"Published"** to ON
   - Click **"Save Changes"**

5. **Verify Visibility:**
   - Log out and log in as candidate
   - Go to `/jobs`
   - Your job should appear in the list

## Step-by-Step: Apply for a Job

### As Candidate

1. **Browse Jobs:**
   - Go to `/jobs`
   - See all published jobs with filters
   - Browse by Industry or Location

2. **View Job Details:**
   - Click on a job card
   - See full description, requirements, salary, skills

3. **Check Application Status:**
   - If you already applied: See "Already Applied" badge with match score
   - If not applied yet: See "Apply Now" button

4. **Apply:**
   - Need a primary resume first (go to `/resume` to upload)
   - Click **"Apply Now"**
   - System creates application with your primary resume
   - Confirmation page shown

5. **Tailor Resume (Optional):**
   - Click **"Tailor Resume with AI"**
   - AI generates customized version matching job requirements
   - Saves new resume version (doesn't affect primary)

## Viewing Applications

### As HR Manager

1. **Navigate to Applicants:**
   - Go to `/jobs/manage`
   - Click on a job card
   - Click **"View Applicants (n)"**

2. **Review Applicants:**
   - See all candidates who applied
   - Match score shows fit percentage
   - Sort by match score to find best candidates
   - Click applicant to see their resume and details

3. **Update Application Status:**
   - Click **"Change Status"**
   - Options: under_review → shortlisted → interview_scheduled → offer_sent → hired
   - System notifies candidate of status changes

## Environment Variables

Ensure `.env.local` has:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # from Supabase settings
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...       # from Supabase settings

# Gemini (for AI tailor resume)
NEXT_PUBLIC_GEMINI_API_KEY=your-api-key

# Other configs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Common Issues & Fixes

### ❌ "Table job_postings does not exist"
**Solution:** Re-run `schema.sql` in Supabase SQL Editor

### ❌ HR Manager sees job page instead of manage page
**Solution:** Verify user role is `hr_manager` in `profiles` table:
```sql
select id, email, role from profiles where email = 'hr@company.com';
```

### ❌ Jobs don't appear in candidate view
**Solution:** Check three things:
```sql
-- 1. Job exists
select id, title, is_published from job_postings where id = 'job-id';

-- 2. Job is published
update job_postings set is_published = true where id = 'job-id';

-- 3. User role is candidate
select id, email, role from profiles where id = 'user-id';
```

### ❌ Can't apply - "No primary resume"
**Solution:** Candidate must upload/set a primary resume:
1. Go to `/resume`
2. Upload or generate a resume
3. Click **"Set as Primary"**
4. Then apply to jobs

## Advanced: Customize Job Fields

To add more fields to job postings:

1. **Add column in Supabase:**
   ```sql
   alter table job_postings
   add column if not exists hiring_manager_id uuid references profiles(id);
   
   alter table job_postings
   add column if not exists benefits text;
   ```

2. **Update types in `lib/types.ts`:**
   ```typescript
   export interface JobPosting {
     // ... existing fields
     hiring_manager_id: string | null;
     benefits: string | null;
   }
   ```

3. **Update form in `app/(dashboard)/jobs/manage/new/new-job-form-client.tsx`**

4. **Update display pages** to show new fields

## API Routes (if building mobile app)

### Get Published Jobs
```
GET /api/jobs?industry=IT&location=Manila
```

### Create Job (HR only)
```
POST /api/jobs
Body: { title, description, requirements, ... }
Auth: Requires hr_manager role
```

### Apply to Job
```
POST /api/applications
Body: { job_posting_id, resume_id, cover_letter? }
Auth: Requires candidate role
```

## Next Steps

1. ✅ Database set up
2. ✅ Create test jobs as HR
3. ✅ Test applications as candidate
4. ⏭️ Set up interview scheduling (`/interviews`)
5. ⏭️ Configure leave management (`/leaves`)
6. ⏭️ Set up payroll system (`/payroll`)

## Support

For issues or questions:
1. Check `docs/DATABASE_SETUP.md`
2. Review database schema in `supabase/schema.sql`
3. Check type definitions in `lib/types.ts`
4. Review Supabase docs: https://supabase.com/docs

---

**Happy Hiring! 🚀**

-- Migration: Add all columns referenced across HR, Employee, and Applicant routes
-- that are missing from the live Supabase database schema.
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).

-- 1. employees: compensation, contact, and edge-function columns
ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS monthly_allowance numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_incentive numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. employee_remote_residences: legacy radius_meters column referenced by geofence-resolver
ALTER TABLE IF EXISTS public.employee_remote_residences
  ADD COLUMN IF NOT EXISTS radius_meters integer DEFAULT 200;

-- 3. work_locations: tenant_id for multi-tenant branch scoping
ALTER TABLE IF EXISTS public.work_locations
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 4. office_branches: is_default flag referenced by hire/promote routes
ALTER TABLE IF EXISTS public.office_branches
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 5. job_offers: job_posting_id column referenced by offer & signed-documents queries
ALTER TABLE IF EXISTS public.job_offers
  ADD COLUMN IF NOT EXISTS job_posting_id uuid;

-- 6. job_applications: interview_qualified_at timestamp
ALTER TABLE IF EXISTS public.job_applications
  ADD COLUMN IF NOT EXISTS interview_qualified_at timestamptz;

-- 7. applications: legacy job_listing_id column
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS job_listing_id uuid;

-- 8. resumes: storage file_path column referenced by delete-resume
ALTER TABLE IF EXISTS public.resumes
  ADD COLUMN IF NOT EXISTS file_path text;

-- 9. resume_versions: legacy job_listing_id column referenced by tailor-resume
ALTER TABLE IF EXISTS public.resume_versions
  ADD COLUMN IF NOT EXISTS job_listing_id uuid;

NOTIFY pgrst, 'reload schema';

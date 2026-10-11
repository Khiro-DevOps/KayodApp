-- ============================================================
-- MIGRATION: Fix HR RLS Policies for interview_schedules
-- File: 20261009_interview_schedules_hr_rls.sql
-- ============================================================

-- Drop existing HR policies to ensure clean re-creation
DROP POLICY IF EXISTS "interview_schedules_hr_crud" ON interview_schedules;
DROP POLICY IF EXISTS "interview_schedules_hr_select" ON interview_schedules;
DROP POLICY IF EXISTS "interview_schedules_hr_insert" ON interview_schedules;
DROP POLICY IF EXISTS "interview_schedules_hr_update" ON interview_schedules;

-- 1. SELECT Policy: HR users (hr, hr_manager, admin) can SELECT schedules within their tenant
CREATE POLICY "interview_schedules_hr_select" ON interview_schedules
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM profiles actor
    JOIN job_applications ja ON ja.id = interview_schedules.application_id
    JOIN job_postings job ON job.id = ja.job_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND actor.tenant_id = job.tenant_id
  )
  OR interview_schedules.interviewer_id = auth.uid()
  OR interview_schedules.applicant_id = auth.uid()
);

-- 2. INSERT Policy: HR users can INSERT schedules for job applications within their tenant
CREATE POLICY "interview_schedules_hr_insert" ON interview_schedules
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles actor
    JOIN job_applications ja ON ja.id = interview_schedules.application_id
    JOIN job_postings job ON job.id = ja.job_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND actor.tenant_id = job.tenant_id
  )
);

-- 3. UPDATE Policy: HR users can UPDATE schedules for job applications within their tenant
CREATE POLICY "interview_schedules_hr_update" ON interview_schedules
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM profiles actor
    JOIN job_applications ja ON ja.id = interview_schedules.application_id
    JOIN job_postings job ON job.id = ja.job_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND actor.tenant_id = job.tenant_id
  )
  OR interview_schedules.interviewer_id = auth.uid()
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles actor
    JOIN job_applications ja ON ja.id = interview_schedules.application_id
    JOIN job_postings job ON job.id = ja.job_id
    WHERE actor.id = auth.uid()
      AND actor.role::text IN ('hr', 'hr_manager', 'admin')
      AND actor.tenant_id = job.tenant_id
  )
  OR interview_schedules.interviewer_id = auth.uid()
  OR interview_schedules.applicant_id = auth.uid()
);

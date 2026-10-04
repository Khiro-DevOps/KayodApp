-- ============================================================
-- MIGRATION: Sprint 2.2 Interview Scheduling Subsystem Overhaul
-- Table: interview_schedules
-- ============================================================

-- 1. Create table `interview_schedules`
CREATE TABLE IF NOT EXISTS interview_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interviewer_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  applicant_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  proposed_slots        JSONB NOT NULL, -- Array of objects: [{ slot_id: string, start_time: ISO, end_time: ISO, status: 'proposed'|'selected'|'declined' }]
  selected_slot         JSONB DEFAULT NULL, -- Final agreed slot object
  status                VARCHAR(50) DEFAULT 'pending_selection',
  reschedule_reason     TEXT DEFAULT NULL,
  meeting_link          TEXT DEFAULT NULL, -- Dynamic video link (Google Meet / Zoom / WebRTC room)
  interviewer_scorecard JSONB DEFAULT NULL, -- Private HR notes & ratings: { rating: 1-5, strengths: string, weaknesses: string, private_notes: string }
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT interview_schedules_status_check
    CHECK (status IN ('pending_selection', 'confirmed', 'reschedule_requested', 'completed', 'cancelled'))
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_interview_schedules_application_id ON interview_schedules(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_schedules_interviewer_id ON interview_schedules(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_interview_schedules_applicant_id ON interview_schedules(applicant_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE interview_schedules ENABLE ROW LEVEL SECURITY;

-- Helper check for HR users (role hr_manager or admin, or matching tenant)
CREATE OR REPLACE FUNCTION is_hr()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('hr_manager', 'admin')
  );
END;
$$;

-- RLS Policy: HR users can CRUD all interview schedules
DROP POLICY IF EXISTS "interview_schedules_hr_crud" ON interview_schedules;
CREATE POLICY "interview_schedules_hr_crud" ON interview_schedules
  FOR ALL
  USING (is_hr())
  WITH CHECK (is_hr());

-- RLS Policy: Applicants can SELECT their own interview schedules
DROP POLICY IF EXISTS "interview_schedules_applicant_select" ON interview_schedules;
CREATE POLICY "interview_schedules_applicant_select" ON interview_schedules
  FOR SELECT
  USING (auth.uid() = applicant_id);

-- RLS Policy: Applicants can UPDATE selected_slot, status, and reschedule_reason for their own interview schedules
DROP POLICY IF EXISTS "interview_schedules_applicant_update" ON interview_schedules;
CREATE POLICY "interview_schedules_applicant_update" ON interview_schedules
  FOR UPDATE
  USING (auth.uid() = applicant_id)
  WITH CHECK (auth.uid() = applicant_id);

-- Add fields to interviews table for candidate preference workflow
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS candidate_interview_type_preference interview_type;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_submitted_at timestamptz;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS preference_status varchar(50) default 'pending' check (preference_status in ('pending', 'submitted', 'confirmed'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_preference 
ON interviews(application_id, preference_status);

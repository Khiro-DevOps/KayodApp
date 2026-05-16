-- Create interview_proposals table to track proposed interview types
CREATE TABLE IF NOT EXISTS interview_proposals (
  id                  uuid primary key default uuid_generate_v4(),
  interview_id        uuid not null references interviews(id) on delete cascade,
  interview_type      interview_type not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(interview_id, interview_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_interview_proposals_interview_id 
ON interview_proposals(interview_id);

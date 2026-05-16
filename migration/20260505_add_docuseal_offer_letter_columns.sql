-- ============================================================
-- KAYOD HRIS — DocuSeal Offer Letter Integration
-- Run this migration in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Add offer letter columns to job_postings
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS docuseal_template_id TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS offer_letter_settings JSONB DEFAULT '{}'::jsonb;

-- Offer letter settings structure (stored as JSONB):
-- {
--   "introMessage": "string (optional, uses default if not set)",
--   "additionalTerms": "string (optional)",
--   "signingDeadlineDays": "number (optional, default: 7)",
--   "requireCountersignature": "boolean (default: false)"
-- }

-- Add DocuSeal submission tracking to applications
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS docuseal_submission_id TEXT;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_postings_docuseal_template_id ON job_postings(docuseal_template_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_docuseal_submission_id ON job_applications(docuseal_submission_id);

-- Update job_applications status to include new offer statuses
-- (The application_status enum should already include: offer_sent, offer_accepted, offer_declined, offer_expired)
-- If not, run: ALTER TYPE application_status ADD VALUE 'offer_accepted';
-- ALTER TYPE application_status ADD VALUE 'offer_declined';
-- ALTER TYPE application_status ADD VALUE 'offer_expired';

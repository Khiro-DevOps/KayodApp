-- ============================================================
-- KAYOD HRIS — Add Notification Preferences to Profiles
-- Adds email_notifications and push_notifications to profiles
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_notifications boolean NOT NULL DEFAULT true;

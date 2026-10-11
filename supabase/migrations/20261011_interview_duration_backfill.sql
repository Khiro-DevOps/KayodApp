-- ============================================================
-- MIGRATION: Backfill duration_minutes and update column default
-- File: 20261011_interview_duration_backfill.sql
-- ============================================================

-- 1. Update column default to 60 minutes
ALTER TABLE interview_schedules
  ALTER COLUMN duration_minutes SET DEFAULT 60;

-- 2. Backfill duration_minutes from selected_slot or proposed_slots
UPDATE interview_schedules
SET duration_minutes = COALESCE(
  NULLIF(
    ROUND(
      EXTRACT(EPOCH FROM (
        COALESCE(
          NULLIF(selected_slot->>'end_time', '')::timestamptz,
          NULLIF(proposed_slots->0->>'end_time', '')::timestamptz
        ) - 
        COALESCE(
          NULLIF(selected_slot->>'start_time', '')::timestamptz,
          NULLIF(proposed_slots->0->>'start_time', '')::timestamptz
        )
      )) / 60
    )::integer,
    0
  ),
  60
)
WHERE duration_minutes IS NULL 
   OR duration_minutes = 45 
   OR duration_minutes <= 0;

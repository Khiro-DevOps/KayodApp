-- ============================================================
-- KAYOD HRIS — Disable promote_to_employee DB trigger
-- Consolidate hire confirmation as explicit server route logic
-- in /api/hr/confirm-hire/[applicationId]
-- ============================================================

DROP TRIGGER IF EXISTS trg_promote_to_employee ON applications;
DROP FUNCTION IF EXISTS promote_to_employee();

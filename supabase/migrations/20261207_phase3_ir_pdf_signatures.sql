-- ============================================================================
-- PHASE 3: IR & Disciplinary PDF Digital Signatures & SHA-256 Audit Integrity
-- File: supabase/migrations/20261207_phase3_ir_pdf_signatures.sql
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Add HR signatory, employee acknowledgment, and SHA-256 audit columns
ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS nte_hr_signature_name text,
  ADD COLUMN IF NOT EXISTS nte_hr_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nte_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS nte_acknowledgment_ip text,
  ADD COLUMN IF NOT EXISTS nte_document_sha256 text,
  ADD COLUMN IF NOT EXISTS decision_hr_signature_name text,
  ADD COLUMN IF NOT EXISTS decision_hr_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_acknowledgment_ip text,
  ADD COLUMN IF NOT EXISTS decision_document_sha256 text;

-- 2. Update employee update guard trigger so target employees can:
--    (a) submit written explanation (nte_issued -> explanation_submitted)
--    (b) acknowledge receipt of NTE while status = 'nte_issued'
--    (c) acknowledge receipt of Notice of Decision while status IN ('resolved', 'dismissed')
CREATE OR REPLACE FUNCTION public.guard_incident_report_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_immutable_core_changed boolean;
  v_nte_hr_fields_changed boolean;
  v_decision_fields_changed boolean;
BEGIN
  -- HR Admin / HR Generalist have full update authority
  IF public.has_hr_role(OLD.tenant_id, ARRAY['hr_admin', 'hr_generalist']) THEN
    RETURN NEW;
  END IF;

  IF OLD.employee_id = public.current_employee_id() THEN
    v_immutable_core_changed :=
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.case_number IS DISTINCT FROM OLD.case_number
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.reported_by IS DISTINCT FROM OLD.reported_by
      OR NEW.incident_date IS DISTINCT FROM OLD.incident_date
      OR NEW.offense_category IS DISTINCT FROM OLD.offense_category
      OR NEW.policy_violated IS DISTINCT FROM OLD.policy_violated
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.evidence_paths IS DISTINCT FROM OLD.evidence_paths;

    v_nte_hr_fields_changed :=
      NEW.nte_issued_at IS DISTINCT FROM OLD.nte_issued_at
      OR NEW.nte_issued_by IS DISTINCT FROM OLD.nte_issued_by
      OR NEW.nte_deadline_at IS DISTINCT FROM OLD.nte_deadline_at
      OR NEW.nte_document_path IS DISTINCT FROM OLD.nte_document_path
      OR NEW.nte_hr_signature_name IS DISTINCT FROM OLD.nte_hr_signature_name
      OR NEW.nte_hr_signed_at IS DISTINCT FROM OLD.nte_hr_signed_at;

    v_decision_fields_changed :=
      NEW.sanction_type IS DISTINCT FROM OLD.sanction_type
      OR NEW.suspension_days IS DISTINCT FROM OLD.suspension_days
      OR NEW.suspension_start_date IS DISTINCT FROM OLD.suspension_start_date
      OR NEW.suspension_end_date IS DISTINCT FROM OLD.suspension_end_date
      OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
      OR NEW.decision_document_path IS DISTINCT FROM OLD.decision_document_path
      OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
      OR NEW.decision_hr_signature_name IS DISTINCT FROM OLD.decision_hr_signature_name
      OR NEW.decision_hr_signed_at IS DISTINCT FROM OLD.decision_hr_signed_at;

    IF v_immutable_core_changed OR v_nte_hr_fields_changed OR v_decision_fields_changed THEN
      RAISE EXCEPTION 'Employees cannot modify incident report, HR signatory, or sanction fields.';
    END IF;

    -- Case A: Acknowledge NTE receipt while status = 'nte_issued'
    IF OLD.status = 'nte_issued'
      AND NEW.status = 'nte_issued'
      AND OLD.nte_acknowledged_at IS NULL
      AND NEW.nte_acknowledged_at IS NOT NULL
    THEN
      IF NEW.employee_explanation IS DISTINCT FROM OLD.employee_explanation
        OR NEW.explanation_submitted_at IS DISTINCT FROM OLD.explanation_submitted_at
        OR NEW.explanation_attachments IS DISTINCT FROM OLD.explanation_attachments
        OR NEW.decision_acknowledged_at IS DISTINCT FROM OLD.decision_acknowledged_at
        OR NEW.decision_acknowledgment_ip IS DISTINCT FROM OLD.decision_acknowledgment_ip
        OR NEW.decision_document_sha256 IS DISTINCT FROM OLD.decision_document_sha256
      THEN
        RAISE EXCEPTION 'NTE acknowledgment may only update NTE acknowledgment fields.';
      END IF;
      RETURN NEW;
    END IF;

    -- Case B: Submit written explanation (nte_issued -> explanation_submitted)
    IF OLD.status = 'nte_issued' AND NEW.status = 'explanation_submitted' THEN
      IF NEW.nte_acknowledged_at IS DISTINCT FROM OLD.nte_acknowledged_at
        OR NEW.nte_acknowledgment_ip IS DISTINCT FROM OLD.nte_acknowledgment_ip
        OR NEW.nte_document_sha256 IS DISTINCT FROM OLD.nte_document_sha256
        OR NEW.decision_acknowledged_at IS DISTINCT FROM OLD.decision_acknowledged_at
        OR NEW.decision_acknowledgment_ip IS DISTINCT FROM OLD.decision_acknowledgment_ip
        OR NEW.decision_document_sha256 IS DISTINCT FROM OLD.decision_document_sha256
      THEN
        RAISE EXCEPTION 'Employees may only update their written explanation and attachments.';
      END IF;
      RETURN NEW;
    END IF;

    -- Case C: Acknowledge Notice of Decision receipt while status IN ('resolved', 'dismissed')
    IF OLD.status IN ('resolved', 'dismissed')
      AND NEW.status = OLD.status
      AND OLD.decision_acknowledged_at IS NULL
      AND NEW.decision_acknowledged_at IS NOT NULL
    THEN
      IF NEW.employee_explanation IS DISTINCT FROM OLD.employee_explanation
        OR NEW.explanation_submitted_at IS DISTINCT FROM OLD.explanation_submitted_at
        OR NEW.explanation_attachments IS DISTINCT FROM OLD.explanation_attachments
        OR NEW.nte_acknowledged_at IS DISTINCT FROM OLD.nte_acknowledged_at
        OR NEW.nte_acknowledgment_ip IS DISTINCT FROM OLD.nte_acknowledgment_ip
        OR NEW.nte_document_sha256 IS DISTINCT FROM OLD.nte_document_sha256
      THEN
        RAISE EXCEPTION 'Decision acknowledgment may only update decision acknowledgment fields.';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Employees may only acknowledge issued notices or submit a written explanation while NTE is issued.';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Update employee UPDATE RLS policy to allow NTE & Decision receipt acknowledgment
DROP POLICY IF EXISTS "incident_reports_employee_update" ON public.incident_reports;
CREATE POLICY "incident_reports_employee_update"
ON public.incident_reports
FOR UPDATE
USING (
  employee_id = public.current_employee_id()
  AND status IN ('nte_issued', 'resolved', 'dismissed')
)
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status IN ('nte_issued', 'explanation_submitted', 'resolved', 'dismissed')
);

NOTIFY pgrst, 'reload schema';

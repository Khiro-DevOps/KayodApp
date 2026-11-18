-- ============================================================
-- MIGRATION: 20261118_offer_chain_job_applications.sql
-- Purpose: Repoint offer-chain tables (job_offers, signed_documents,
--          job_offer_negotiations) to canonical job_applications,
--          align job_offers columns/enums, expand job_applications
--          status check, and repoint offer-chain triggers & RLS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Guard: abort if any in-scope table has application_id rows
--    absent from public.job_applications
-- ------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_orphan_count bigint;
BEGIN
  IF to_regclass('public.job_applications') IS NULL THEN
    RAISE EXCEPTION 'Canonical table public.job_applications does not exist';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['job_offers', 'signed_documents', 'job_offer_negotiations']
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format(
        'SELECT count(*) FROM public.%I t WHERE t.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.job_applications ja WHERE ja.id = t.application_id)',
        v_table
      ) INTO v_orphan_count;

      IF v_orphan_count > 0 THEN
        RAISE EXCEPTION 'Table % has % row(s) with application_id not present in job_applications', v_table, v_orphan_count;
      END IF;
    END IF;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 2. job_applications.contract_offer_id -> signed_documents(id)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL THEN
    ALTER TABLE public.job_applications
      ADD COLUMN IF NOT EXISTS contract_offer_id uuid;

    IF to_regclass('public.signed_documents') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = to_regclass('public.job_applications')
           AND conname = 'job_applications_contract_offer_id_fkey'
       )
    THEN
      ALTER TABLE public.job_applications
        ADD CONSTRAINT job_applications_contract_offer_id_fkey
        FOREIGN KEY (contract_offer_id)
        REFERENCES public.signed_documents(id)
        ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_job_applications_contract_offer_id
      ON public.job_applications(contract_offer_id);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. Repoint application_id FKs on job_offers, signed_documents,
--    and job_offer_negotiations to job_applications(id)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL THEN
    -- job_offers
    IF to_regclass('public.job_offers') IS NOT NULL THEN
      ALTER TABLE public.job_offers
        DROP CONSTRAINT IF EXISTS job_offers_application_id_fkey;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.job_offers')
          AND conname = 'job_offers_application_id_job_applications_fkey'
      ) THEN
        ALTER TABLE public.job_offers
          ADD CONSTRAINT job_offers_application_id_job_applications_fkey
          FOREIGN KEY (application_id)
          REFERENCES public.job_applications(id)
          ON DELETE CASCADE;
      END IF;
    END IF;

    -- signed_documents
    IF to_regclass('public.signed_documents') IS NOT NULL THEN
      ALTER TABLE public.signed_documents
        DROP CONSTRAINT IF EXISTS signed_documents_application_id_fkey;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.signed_documents')
          AND conname = 'signed_documents_application_id_job_applications_fkey'
      ) THEN
        ALTER TABLE public.signed_documents
          ADD CONSTRAINT signed_documents_application_id_job_applications_fkey
          FOREIGN KEY (application_id)
          REFERENCES public.job_applications(id)
          ON DELETE CASCADE;
      END IF;
    END IF;

    -- job_offer_negotiations
    IF to_regclass('public.job_offer_negotiations') IS NOT NULL THEN
      ALTER TABLE public.job_offer_negotiations
        DROP CONSTRAINT IF EXISTS job_offer_negotiations_application_id_fkey;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.job_offer_negotiations')
          AND conname = 'job_offer_negotiations_application_id_job_applications_fkey'
      ) THEN
        ALTER TABLE public.job_offer_negotiations
          ADD CONSTRAINT job_offer_negotiations_application_id_job_applications_fkey
          FOREIGN KEY (application_id)
          REFERENCES public.job_applications(id)
          ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 4. Add missing code-referenced columns on job_offers
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.job_offers') IS NOT NULL THEN
    ALTER TABLE public.job_offers
      ADD COLUMN IF NOT EXISTS work_mode text,
      ADD COLUMN IF NOT EXISTS work_location_id uuid,
      ADD COLUMN IF NOT EXISTS shift_start text,
      ADD COLUMN IF NOT EXISTS shift_end text,
      ADD COLUMN IF NOT EXISTS work_days text[],
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS contract_template_id uuid,
      ADD COLUMN IF NOT EXISTS hr_id uuid;

    IF to_regclass('public.office_branches') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = to_regclass('public.job_offers')
           AND conname = 'job_offers_work_location_id_fkey'
       )
    THEN
      ALTER TABLE public.job_offers
        ADD CONSTRAINT job_offers_work_location_id_fkey
        FOREIGN KEY (work_location_id)
        REFERENCES public.office_branches(id)
        ON DELETE SET NULL;
    END IF;

    IF to_regclass('public.contract_templates') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = to_regclass('public.job_offers')
           AND conname = 'job_offers_contract_template_id_fkey'
       )
    THEN
      ALTER TABLE public.job_offers
        ADD CONSTRAINT job_offers_contract_template_id_fkey
        FOREIGN KEY (contract_template_id)
        REFERENCES public.contract_templates(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 5. Extend offer_status enum if present
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
    ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'EXPIRED';
    ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'PENDING_SIGNATURE';
    ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'HIRE_CONFIRMED';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 6. Rebuild job_applications_status_check with full stage union
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL THEN
    ALTER TABLE public.job_applications
      DROP CONSTRAINT IF EXISTS job_applications_status_check;

    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_status_check
      CHECK (
        status IN (
          'applied',
          'draft',
          'submitted',
          'screening',
          'under_review',
          'shortlisted',
          'interview',
          'interviewing',
          'interview_scheduled',
          'interviewed',
          'offer',
          'offer_sent',
          'negotiating',
          'offer_accepted',
          'offer_declined',
          'offer_expired',
          'pre_employment',
          'hired',
          'hire_confirmed',
          'rejected',
          'withdrawn'
        )
      );
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 7. Repoint functions and triggers on signed_documents & job_offers
--    to read/write job_applications
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_application_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.job_applications
  SET updated_at = now()
  WHERE id = new.application_id;
  RETURN new;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.signed_documents') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_signed_documents_update_application_timestamp ON public.signed_documents;
    CREATE TRIGGER trg_signed_documents_update_application_timestamp
      AFTER INSERT OR UPDATE ON public.signed_documents
      FOR EACH ROW
      EXECUTE FUNCTION public.update_application_timestamp();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.handle_hire_finalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_applicant_profile_id uuid;
BEGIN
  -- Execute ONLY when the HR sets the offer status to 'FINALIZED'
  IF NEW.status = 'FINALIZED' AND OLD.status != 'FINALIZED' THEN

    -- 1. Fetch the profile ID linked to the application
    SELECT applicant_id INTO v_applicant_profile_id
    FROM public.job_applications
    WHERE id = NEW.application_id;

    -- 2. Update Application Status
    UPDATE public.job_applications
    SET
      status = 'hired',
      updated_at = NOW()
    WHERE id = NEW.application_id;

    -- 3. Transition the Profile Role (Applicant -> Employee)
    UPDATE public.profiles
    SET
      role = 'employee',
      onboarding_status = 'pending_setup',
      department = NEW.department,
      updated_at = NOW()
    WHERE id = v_applicant_profile_id;

    -- 4. Insert notification
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications') THEN
      INSERT INTO public.notifications (user_id, type, title, message)
      VALUES (
        v_applicant_profile_id,
        'system',
        'Welcome to the Team!',
        'Your employment contract has been finalized. Please proceed to the Employee Dashboard to begin your onboarding.'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_job_offer_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_candidate_id uuid;
  v_job_title text;
  v_company_name text;
BEGIN
  -- Only notify when status changes to SENT
  IF new.status = 'SENT' AND (old.status IS DISTINCT FROM 'SENT') THEN
    -- Fetch candidate ID and job title
    SELECT a.applicant_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM public.job_applications a
    JOIN public.job_postings jp ON jp.id = a.job_id
    WHERE a.id = new.application_id;

    IF v_candidate_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, action_url, is_read)
      VALUES (
        v_candidate_id,
        'offer_letter',
        'Job Offer for ' || COALESCE(v_job_title, 'position'),
        'You have received a job offer. Review the contract and accept or decline.',
        '/applicant/applications/' || new.application_id,
        false
      );
    END IF;
  END IF;

  -- Notify when offer is accepted
  IF new.status = 'ACCEPTED' AND (old.status IS DISTINCT FROM 'ACCEPTED') THEN
    SELECT a.applicant_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM public.job_applications a
    JOIN public.job_postings jp ON jp.id = a.job_id
    WHERE a.id = new.application_id;

    -- Notify HR/recruiter (job creator) that offer was accepted
    INSERT INTO public.notifications (recipient_id, type, title, body, action_url, is_read)
    VALUES (
      (SELECT jp.created_by FROM public.job_postings jp WHERE jp.id = new.job_id),
      'offer_letter',
      'Offer Accepted for ' || COALESCE(v_job_title, 'position'),
      'The candidate has accepted the job offer.',
      '/hr/offers/' || new.application_id,
      false
    );
  END IF;

  -- Notify when offer is declined
  IF new.status = 'DECLINED' AND (old.status IS DISTINCT FROM 'DECLINED') THEN
    SELECT a.applicant_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM public.job_applications a
    JOIN public.job_postings jp ON jp.id = a.job_id
    WHERE a.id = new.application_id;

    -- Notify HR/recruiter that offer was declined
    INSERT INTO public.notifications (recipient_id, type, title, body, action_url, is_read)
    VALUES (
      (SELECT jp.created_by FROM public.job_postings jp WHERE jp.id = new.job_id),
      'offer_letter',
      'Offer Declined for ' || COALESCE(v_job_title, 'position'),
      'The candidate has declined the job offer.',
      '/hr/offers/' || new.application_id,
      false
    );
  END IF;

  RETURN new;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.job_offers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trigger_finalize_hire ON public.job_offers;
    CREATE TRIGGER trigger_finalize_hire
      AFTER UPDATE OF status ON public.job_offers
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_hire_finalization();

    DROP TRIGGER IF EXISTS trg_notify_job_offer_status ON public.job_offers;
    CREATE TRIGGER trg_notify_job_offer_status
      AFTER UPDATE ON public.job_offers
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_job_offer_sent();
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 8. Repoint RLS policies on signed_documents and job_offers
--    that referenced legacy applications
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.signed_documents') IS NOT NULL THEN
    DROP POLICY IF EXISTS "signed_documents_candidate_view_own" ON public.signed_documents;
    CREATE POLICY "signed_documents_candidate_view_own"
      ON public.signed_documents FOR SELECT
      USING (
        application_id IN (
          SELECT id FROM public.job_applications
          WHERE applicant_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "signed_documents_hr_view_own_jobs" ON public.signed_documents;
    CREATE POLICY "signed_documents_hr_view_own_jobs"
      ON public.signed_documents FOR SELECT
      USING (
        application_id IN (
          SELECT a.id FROM public.job_applications a
          JOIN public.job_postings jp ON a.job_id = jp.id
          WHERE jp.created_by = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('hr_manager', 'admin')
          )
        )
      );

    DROP POLICY IF EXISTS "signed_documents_hr_insert_own_jobs" ON public.signed_documents;
    CREATE POLICY "signed_documents_hr_insert_own_jobs"
      ON public.signed_documents FOR INSERT
      WITH CHECK (
        application_id IN (
          SELECT a.id FROM public.job_applications a
          JOIN public.job_postings jp ON a.job_id = jp.id
          WHERE jp.created_by = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('hr_manager', 'admin')
          )
        )
      );

    DROP POLICY IF EXISTS "signed_documents_hr_update_own_jobs" ON public.signed_documents;
    CREATE POLICY "signed_documents_hr_update_own_jobs"
      ON public.signed_documents FOR UPDATE
      USING (
        application_id IN (
          SELECT a.id FROM public.job_applications a
          JOIN public.job_postings jp ON a.job_id = jp.id
          WHERE jp.created_by = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('hr_manager', 'admin')
          )
        )
      );

    DROP POLICY IF EXISTS "signed_documents_candidate_update_own" ON public.signed_documents;
    CREATE POLICY "signed_documents_candidate_update_own"
      ON public.signed_documents FOR UPDATE
      USING (
        application_id IN (
          SELECT id FROM public.job_applications
          WHERE applicant_id = auth.uid()
        )
      )
      WITH CHECK (
        application_id IN (
          SELECT id FROM public.job_applications
          WHERE applicant_id = auth.uid()
        )
      );
  END IF;

  IF to_regclass('public.job_offers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "job_offers_candidate_view" ON public.job_offers;
    CREATE POLICY "job_offers_candidate_view"
      ON public.job_offers FOR SELECT
      USING (
        is_active = true
        AND status != 'DRAFT'
        AND EXISTS (
          SELECT 1 FROM public.job_applications a
          WHERE a.id = job_offers.application_id
          AND a.applicant_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- ============================================================
-- 9. VERIFICATION BLOCK (SELECT ONLY - COMMENTED)
-- ============================================================
-- -- 9a. Foreign keys on job_offers, signed_documents, job_offer_negotiations, and job_applications
-- SELECT
--   conrelid::regclass AS table_name,
--   conname AS constraint_name,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE contype = 'f'
--   AND conrelid IN (
--     to_regclass('public.job_offers'),
--     to_regclass('public.signed_documents'),
--     to_regclass('public.job_offer_negotiations'),
--     to_regclass('public.job_applications')
--   )
-- ORDER BY table_name::text, constraint_name;
--
-- -- 9b. job_applications_status_check definition
-- SELECT
--   conname,
--   pg_get_constraintdef(oid) AS status_check_definition
-- FROM pg_constraint
-- WHERE conrelid = to_regclass('public.job_applications')
--   AND conname = 'job_applications_status_check';
--
-- -- 9c. Column lists for job_offers and signed_documents
-- SELECT
--   table_name,
--   column_name,
--   data_type,
--   udt_name,
--   is_nullable,
--   column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('job_offers', 'signed_documents')
-- ORDER BY table_name, ordinal_position;
--
-- -- 9d. RLS policies on job_offers, signed_documents, job_offer_negotiations
-- SELECT
--   tablename,
--   policyname,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('job_offers', 'signed_documents', 'job_offer_negotiations')
-- ORDER BY tablename, policyname;
--
-- -- 9e. Triggers on job_offers, signed_documents, job_offer_negotiations
-- SELECT
--   tgrelid::regclass AS table_name,
--   tgname AS trigger_name,
--   pg_get_triggerdef(oid) AS trigger_definition
-- FROM pg_trigger
-- WHERE NOT tgisinternal
--   AND tgrelid IN (
--     to_regclass('public.job_offers'),
--     to_regclass('public.signed_documents'),
--     to_regclass('public.job_offer_negotiations')
--   )
-- ORDER BY table_name::text, trigger_name;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_application_id_fkey;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE SET NULL;

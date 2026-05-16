-- ============================================================
-- TRIGGER: auto-notify candidate when job offer is sent
-- ============================================================

CREATE OR REPLACE FUNCTION notify_job_offer_sent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_candidate_id uuid;
  v_job_title text;
  v_company_name text;
BEGIN
  -- Only notify when status changes to SENT
  IF new.status = 'SENT' AND (old.status IS DISTINCT FROM 'SENT') THEN
    -- Fetch candidate ID and job title
    SELECT a.candidate_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM applications a
    JOIN job_postings jp ON jp.id = a.job_posting_id
    WHERE a.id = new.application_id;

    IF v_candidate_id IS NOT NULL THEN
      INSERT INTO notifications (recipient_id, type, title, body, action_url, is_read)
      VALUES (
        v_candidate_id,
        'offer_letter',
        'Job Offer for ' || COALESCE(v_job_title, 'position'),
        'You have received a job offer. Review the contract and accept or decline.',
        '/applications/' || new.application_id,
        false
      );
    END IF;
  END IF;

  -- Notify when offer is accepted
  IF new.status = 'ACCEPTED' AND (old.status IS DISTINCT FROM 'ACCEPTED') THEN
    SELECT a.candidate_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM applications a
    JOIN job_postings jp ON jp.id = a.job_posting_id
    WHERE a.id = new.application_id;

    -- Notify HR/recruiter (job creator) that offer was accepted
    INSERT INTO notifications (recipient_id, type, title, body, action_url, is_read)
    VALUES (
      (SELECT jp.created_by FROM job_postings jp WHERE jp.id = new.job_posting_id),
      'offer_letter',
      'Offer Accepted for ' || COALESCE(v_job_title, 'position'),
      'The candidate has accepted the job offer.',
      '/jobs/manage/' || new.job_posting_id || '/applicants/' || new.application_id,
      false
    );
  END IF;

  -- Notify when offer is declined
  IF new.status = 'DECLINED' AND (old.status IS DISTINCT FROM 'DECLINED') THEN
    SELECT a.candidate_id, jp.title
    INTO v_candidate_id, v_job_title
    FROM applications a
    JOIN job_postings jp ON jp.id = a.job_posting_id
    WHERE a.id = new.application_id;

    -- Notify HR/recruiter that offer was declined
    INSERT INTO notifications (recipient_id, type, title, body, action_url, is_read)
    VALUES (
      (SELECT jp.created_by FROM job_postings jp WHERE jp.id = new.job_posting_id),
      'offer_letter',
      'Offer Declined for ' || COALESCE(v_job_title, 'position'),
      'The candidate has declined the job offer.',
      '/jobs/manage/' || new.job_posting_id || '/applicants/' || new.application_id,
      false
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_job_offer_status ON job_offers;
CREATE TRIGGER trg_notify_job_offer_status
  AFTER UPDATE ON job_offers
  FOR EACH ROW EXECUTE PROCEDURE notify_job_offer_sent();

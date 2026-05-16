    -- ============================================================
    -- KAYOD HRIS — Job Offer Expiry Automation
    -- Adds scheduled job for marking expired offers
    -- ============================================================

    -- ============================================================
    -- CREATE FUNCTION: expire_job_offers
    -- Runs daily to mark offers as expired
    -- ============================================================

    create or replace function expire_job_offers()
    returns void as $$
    declare
    v_expired_count int := 0;
    begin
    -- Mark expired offers
    update job_offer_applications
    set status = 'expired'
    where status in ('pending', 'negotiating')
    and expires_at < now()
    and status != 'expired';

    get diagnostics v_expired_count = row_count;

    -- Log expiration
    if v_expired_count > 0 then
        insert into audit_logs (action, details, created_at)
        values ('expire_job_offers', jsonb_build_object('expired_count', v_expired_count), now());
    end if;
    end;
    $$ language plpgsql security definer;

    -- ============================================================
    -- CREATE SCHEDULED JOB: expire_offers_daily
    -- Runs every day at 00:30 UTC
    -- ============================================================

    -- First, check if job exists and delete it
    select cron.unschedule(jobname) from cron.job 
    where jobname = 'expire_offers_daily';

    -- Schedule the job
    select cron.schedule(
    'expire_offers_daily',
    '30 0 * * *',  -- Every day at 00:30 UTC
    'select expire_job_offers();'
    );

    -- ============================================================
    -- NOTIFICATION TRIGGER FOR OFFER EXPIRY
    -- Notifies HR when offers expire
    -- ============================================================

    create or replace function notify_hr_offer_expired()
    returns trigger as $$
    declare
    v_applicant_name text;
    v_job_title text;
    begin
    if new.status = 'expired' and old.status != 'expired' then
        -- Get applicant and job info
        select 
        concat(p.first_name, ' ', p.last_name),
        jp.title
        into v_applicant_name, v_job_title
        from profiles p
        join applications a on a.candidate_id = p.id
        join job_postings jp on a.job_posting_id = jp.id
        where a.id = new.application_id;

        -- Insert notification
        insert into notifications (recipient_id, type, title, body, action_url)
        values (
        new.hr_id,
        'offer_letter',
        '⏰ Offer Expired',
        coalesce(v_applicant_name, 'A candidate') || ' did not respond to the offer for ' || coalesce(v_job_title, 'this position') || '.',
        '/job-offer/' || new.id
        );
    end if;

    return new;
    end;
    $$ language plpgsql;

    -- Drop trigger if exists
    drop trigger if exists trg_notify_offer_expiry on job_offer_applications;

    -- Create trigger
    create trigger trg_notify_offer_expiry
    after update on job_offer_applications
    for each row
    execute function notify_hr_offer_expired();

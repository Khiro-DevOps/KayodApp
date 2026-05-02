-- Ensure scheduled interview notifications link to the interviews list.
create or replace function notify_interview_scheduled()
returns trigger language plpgsql security definer as $$
declare
  v_candidate_id  uuid;
  v_job_title     text;
  v_type          text;
begin
  select a.candidate_id, jp.title
  into v_candidate_id, v_job_title
  from applications a
  join job_postings jp on jp.id = a.job_posting_id
  where a.id = new.application_id;

  v_type := case new.interview_type when 'online' then 'online' else 'in-person' end;

  insert into notifications (recipient_id, type, title, body, action_url)
  values (
    v_candidate_id,
    'interview_scheduled',
    'Interview scheduled for ' || v_job_title,
    'Your ' || v_type || ' interview has been scheduled. Click to view details.',
    '/interviews'
  );

  return new;
end;
$$;

-- Backfill existing notifications created with /interviews/<id> style links.
update notifications
set action_url = '/interviews'
where type in ('interview_scheduled', 'interview_rescheduled')
  and action_url like '/interviews/%';

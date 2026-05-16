do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_type') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notification_type'
        and e.enumlabel = 'interview_rescheduled'
    ) then
      alter type notification_type add value 'interview_rescheduled';
    end if;
  end if;
end
$$;

create or replace function notify_interview_rescheduled()
returns trigger language plpgsql security definer as $$
declare
  v_candidate_id uuid;
  v_job_title text;
  v_type text;
begin
  if old.scheduled_at = new.scheduled_at
     and old.interview_type = new.interview_type
     and coalesce(old.location_address, '') = coalesce(new.location_address, '')
     and coalesce(old.video_room_url, '') = coalesce(new.video_room_url, '') then
    return new;
  end if;

  select a.candidate_id, jp.title
  into v_candidate_id, v_job_title
  from applications a
  join job_postings jp on jp.id = a.job_posting_id
  where a.id = new.application_id;

  v_type := case new.interview_type when 'online' then 'online' else 'in-person' end;

  begin
    insert into notifications (recipient_id, type, title, body, action_url)
    values (
      v_candidate_id,
      'interview_rescheduled',
      'Interview Rescheduled for ' || v_job_title,
      'Your ' || v_type || ' interview has been rescheduled. Click to view details.',
      '/interviews'
    );
  exception
    when invalid_text_representation then
      insert into notifications (recipient_id, type, title, body, action_url)
      values (
        v_candidate_id,
        'interview_scheduled',
        'Interview Rescheduled for ' || v_job_title,
        'Your ' || v_type || ' interview has been rescheduled. Click to view details.',
        '/interviews'
      );
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_interview_rescheduled on interviews;
create trigger trg_notify_interview_rescheduled
  after update on interviews
  for each row execute procedure notify_interview_rescheduled();

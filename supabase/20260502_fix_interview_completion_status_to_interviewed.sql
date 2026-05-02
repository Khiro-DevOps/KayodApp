create or replace function complete_interview_and_update_application(p_interview_id uuid)
returns table (
  interview_id uuid,
  application_id uuid,
  interview_status interview_status,
  application_status application_status,
  ended_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_interview record;
begin
  select p.role
    into v_role
    from profiles p
   where p.id = auth.uid();

  if auth.uid() is null or v_role not in ('hr_manager', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select
    i.id,
    i.application_id,
    jp.created_by
    into v_interview
    from interviews i
    join applications a on a.id = i.application_id
    join job_postings jp on jp.id = a.job_posting_id
   where i.id = p_interview_id;

  if not found then
    raise exception 'interview not found' using errcode = 'P0002';
  end if;

  if v_role = 'hr_manager' and v_interview.created_by <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update interviews
     set status = 'completed',
         ended_at = coalesce(ended_at, now()),
         updated_at = now()
   where id = p_interview_id
   returning interviews.id, interviews.application_id, interviews.status, interviews.ended_at
    into interview_id, application_id, interview_status, ended_at;

  update applications
      set status = 'under_review',
         updated_at = now()
   where id = application_id
   returning applications.status into application_status;

  return next;
end;
$$;

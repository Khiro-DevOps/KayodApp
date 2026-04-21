-- Add HR-defined interview mode constraints and candidate final mode selection.
-- This supports async, multi-actor scheduling:
-- 1) HR defines supported modes (+ office address when in-person is available)
-- 2) Candidate selects final mode from those options

alter table if exists applications
  add column if not exists hr_offered_modes interview_type[] not null default array['online'::interview_type],
  add column if not exists hr_office_address text,
  add column if not exists selected_mode interview_type,
  add column if not exists selected_mode_set_at timestamptz;

-- Keep existing data usable after migration.
update applications
set selected_mode = interview_preference
where selected_mode is null
  and interview_preference is not null;

update applications
set hr_offered_modes = array[interview_preference]
where (hr_offered_modes is null or cardinality(hr_offered_modes) = 0)
  and interview_preference is not null;

update applications
set hr_offered_modes = array['online'::interview_type]
where hr_offered_modes is null
   or cardinality(hr_offered_modes) = 0;

alter table applications
  add constraint chk_applications_hr_offered_modes_nonempty
  check (cardinality(hr_offered_modes) > 0);

create index if not exists idx_applications_hr_offered_modes
  on applications using gin (hr_offered_modes);

create index if not exists idx_applications_selected_mode
  on applications(selected_mode);

create or replace function set_application_interview_preference(
  p_application_id uuid,
  p_preference interview_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status application_status;
  v_candidate_id uuid;
  v_hr_offered_modes interview_type[];
begin
  select a.status, a.candidate_id, a.hr_offered_modes
  into v_status, v_candidate_id, v_hr_offered_modes
  from applications a
  where a.id = p_application_id;

  if v_candidate_id is null then
    raise exception 'Application not found';
  end if;

  if auth.uid() is null or v_candidate_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if v_status not in ('shortlisted', 'interview_scheduled', 'under_review') then
    raise exception 'Application not eligible';
  end if;

  if v_hr_offered_modes is null or cardinality(v_hr_offered_modes) = 0 then
    raise exception 'Interview mode is not configured by HR';
  end if;

  if not (p_preference = any(v_hr_offered_modes)) then
    raise exception 'Selected mode is not available for this application';
  end if;

  update applications
  set selected_mode = p_preference,
      selected_mode_set_at = now(),
      -- Keep legacy fields in sync for backward compatibility.
      interview_preference = p_preference,
      interview_preference_set_at = now(),
      updated_at = now()
  where id = p_application_id;
end;
$$;

grant execute on function set_application_interview_preference(uuid, interview_type) to authenticated;

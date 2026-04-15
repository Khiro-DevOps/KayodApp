-- Adds candidate interview preference tracking to applications
-- and an RPC helper so candidates can set preference safely with RLS enabled.

alter table if exists applications
	add column if not exists interview_preference interview_type,
	add column if not exists interview_preference_set_at timestamptz,
	add column if not exists interview_qualified_at timestamptz;

create index if not exists idx_applications_interview_preference
	on applications(interview_preference);

create index if not exists idx_applications_interview_qualified_at
	on applications(interview_qualified_at);

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
begin
	select a.status, a.candidate_id
	into v_status, v_candidate_id
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

	update applications
	set interview_preference = p_preference,
			interview_preference_set_at = now(),
			updated_at = now()
	where id = p_application_id;
end;
$$;

grant execute on function set_application_interview_preference(uuid, interview_type) to authenticated;

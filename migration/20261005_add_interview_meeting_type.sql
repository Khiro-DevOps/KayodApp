alter table interview_schedules
  add column if not exists meeting_type text not null default 'online',
  add column if not exists office_branch_id uuid references office_branches(id) on delete set null;

update interview_schedules
set meeting_type = 'online'
where meeting_type is null;

alter table interview_schedules
  drop constraint if exists interview_schedules_meeting_type_check,
  drop constraint if exists interview_schedules_in_person_branch_check;

alter table interview_schedules
  add constraint interview_schedules_meeting_type_check
    check (meeting_type in ('online', 'in_person')),
  add constraint interview_schedules_in_person_branch_check
    check (meeting_type <> 'in_person' or office_branch_id is not null);

create index if not exists idx_interview_schedules_office_branch_id
  on interview_schedules(office_branch_id);

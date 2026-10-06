-- Normalize the legacy "Both" choice to the persisted hybrid meeting type.
update interview_schedules
set meeting_type = 'hybrid'
where lower(meeting_type) in ('both', 'hybrid');

alter table interview_schedules
  drop constraint if exists interview_schedules_meeting_type_check,
  drop constraint if exists interview_schedules_in_person_branch_check;

alter table interview_schedules
  add constraint interview_schedules_meeting_type_check
    check (meeting_type in ('online', 'in_person', 'hybrid')),
  add constraint interview_schedules_in_person_branch_check
    check (meeting_type not in ('in_person', 'hybrid') or office_branch_id is not null);

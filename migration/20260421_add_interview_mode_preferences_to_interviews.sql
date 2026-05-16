-- Optional interview-level preference fields for mode availability + applicant choice.
-- Existing application-level fields remain the source of truth for current flows.

alter table if exists interviews
  add column if not exists available_modes interview_type[] not null default array['online'::interview_type],
  add column if not exists location_details text,
  add column if not exists applicant_selection interview_type;

update interviews
set available_modes = array[interview_type]
where available_modes is null
   or cardinality(available_modes) = 0;

update interviews
set location_details = location_address
where location_details is null
  and location_address is not null;

update interviews
set applicant_selection = candidate_interview_type_preference
where applicant_selection is null
  and candidate_interview_type_preference is not null;

alter table interviews
  add constraint chk_interviews_available_modes_nonempty
  check (cardinality(available_modes) > 0);

create index if not exists idx_interviews_available_modes
  on interviews using gin (available_modes);

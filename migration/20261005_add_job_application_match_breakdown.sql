alter table job_applications
  add column if not exists technical_alignment numeric(5,2),
  add column if not exists role_fit numeric(5,2);

create index if not exists idx_job_applications_match_score
  on job_applications(match_score);

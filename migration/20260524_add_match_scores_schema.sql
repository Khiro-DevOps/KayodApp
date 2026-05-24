-- ============================================================
-- KAYOD HRIS — Match Score Schema Migration
-- Adds weighted match-score storage and supporting experience columns.
-- ============================================================

do $$
begin
  create extension if not exists pgcrypto;
exception
  when duplicate_object then null;
end $$;

alter table if exists job_postings
  add column if not exists min_experience int default 0;

alter table if exists resumes
  add column if not exists total_years_experience int default null;

create table if not exists match_scores (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references profiles(id) on delete cascade,
  job_id uuid references job_postings(id) on delete cascade,
  score_total int check (score_total between 0 and 100),
  score_skills int,
  score_title int,
  score_experience int,
  score_education int,
  score_setup int,
  reasons text[],
  computed_at timestamptz default now(),
  unique(applicant_id, job_id)
);

create index if not exists idx_match_scores_applicant_id on match_scores(applicant_id);
create index if not exists idx_match_scores_job_id on match_scores(job_id);

alter table match_scores enable row level security;

drop policy if exists "match_scores_candidate_view_own" on match_scores;
create policy "match_scores_candidate_view_own"
  on match_scores for select
  using (
    applicant_id = auth.uid()
  );

drop policy if exists "match_scores_hr_view_own_jobs" on match_scores;
create policy "match_scores_hr_view_own_jobs"
  on match_scores for select
  using (
    exists (
      select 1
      from job_postings jp
      where jp.id = match_scores.job_id
        and jp.created_by = auth.uid()
        and exists (
          select 1
          from profiles p
          where p.id = auth.uid()
            and p.role in ('hr_manager', 'admin')
        )
    )
  );
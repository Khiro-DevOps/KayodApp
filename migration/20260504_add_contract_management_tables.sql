-- ============================================================
-- KAYOD HRIS — Contract Management Schema
-- Run this migration to add Docuseal contract integration tables
-- ============================================================

-- ============================================================
-- CREATE contract_templates TABLE
-- (Stores Docuseal template mappings per job posting)
-- ============================================================

create table if not exists contract_templates (
  id uuid primary key default uuid_generate_v4(),
  job_posting_id uuid not null references job_postings(id) on delete cascade,
  docuseal_template_id text not null,
  external_id text unique not null,
  template_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint unique_job_template unique (job_posting_id, docuseal_template_id)
);

create index if not exists idx_contract_templates_job_posting_id on contract_templates(job_posting_id);
create index if not exists idx_contract_templates_docuseal_id on contract_templates(docuseal_template_id);

-- ============================================================
-- CREATE signed_documents TABLE
-- (Stores applicant contract signing records)
-- ============================================================

create table if not exists signed_documents (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  contract_template_id uuid not null references contract_templates(id) on delete restrict,
  signing_method text not null check (signing_method in ('digital', 'in_person')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'signed', 'declined', 'expired')),
  docuseal_submitter_id text,
  docuseal_submission_url text,
  pdf_download_token text unique,
  pdf_file_path text,
  signed_at timestamp with time zone,
  signed_values jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_signed_documents_application_id on signed_documents(application_id);
create index if not exists idx_signed_documents_contract_template_id on signed_documents(contract_template_id);
create index if not exists idx_signed_documents_status on signed_documents(status);
create index if not exists idx_signed_documents_docuseal_submitter on signed_documents(docuseal_submitter_id);

-- ============================================================
-- ADD contract_offer_id TO applications TABLE
-- (Links to the current active signed_documents record)
-- ============================================================

alter table applications add column if not exists contract_offer_id uuid references signed_documents(id) on delete set null;

create index if not exists idx_applications_contract_offer_id on applications(contract_offer_id);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table contract_templates enable row level security;
alter table signed_documents enable row level security;

-- ============================================================
-- CREATE RLS POLICIES
-- ============================================================

-- contract_templates: HR can view templates for their job postings
drop policy if exists "contract_templates_hr_view_own_jobs" on contract_templates;
create policy "contract_templates_hr_view_own_jobs"
  on contract_templates for select
  using (
    exists(
      select 1 from job_postings jp
      where jp.id = contract_templates.job_posting_id
      and jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- contract_templates: HR can insert templates for their jobs
drop policy if exists "contract_templates_hr_insert_own_jobs" on contract_templates;
create policy "contract_templates_hr_insert_own_jobs"
  on contract_templates for insert
  with check (
    exists(
      select 1 from job_postings jp
      where jp.id = contract_templates.job_posting_id
      and jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- contract_templates: HR can update templates for their jobs
drop policy if exists "contract_templates_hr_update_own_jobs" on contract_templates;
create policy "contract_templates_hr_update_own_jobs"
  on contract_templates for update
  using (
    exists(
      select 1 from job_postings jp
      where jp.id = contract_templates.job_posting_id
      and jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- signed_documents: Candidate can view their own signed documents
drop policy if exists "signed_documents_candidate_view_own" on signed_documents;
create policy "signed_documents_candidate_view_own"
  on signed_documents for select
  using (
    application_id in (
      select id from applications
      where candidate_id = auth.uid()
    )
  );

-- signed_documents: HR can view signed documents for their job applicants
drop policy if exists "signed_documents_hr_view_own_jobs" on signed_documents;
create policy "signed_documents_hr_view_own_jobs"
  on signed_documents for select
  using (
    application_id in (
      select a.id from applications a
      join job_postings jp on a.job_posting_id = jp.id
      where jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- signed_documents: HR can insert signed documents for their applicants
drop policy if exists "signed_documents_hr_insert_own_jobs" on signed_documents;
create policy "signed_documents_hr_insert_own_jobs"
  on signed_documents for insert
  with check (
    application_id in (
      select a.id from applications a
      join job_postings jp on a.job_posting_id = jp.id
      where jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- signed_documents: HR can update signed documents for their applicants
drop policy if exists "signed_documents_hr_update_own_jobs" on signed_documents;
create policy "signed_documents_hr_update_own_jobs"
  on signed_documents for update
  using (
    application_id in (
      select a.id from applications a
      join job_postings jp on a.job_posting_id = jp.id
      where jp.created_by = auth.uid()
      and exists(
        select 1 from profiles p
        where p.id = auth.uid()
        and p.role in ('hr_manager', 'admin')
      )
    )
  );

-- signed_documents: Candidates can update their own signed document status (for in-person uploads)
drop policy if exists "signed_documents_candidate_update_own" on signed_documents;
create policy "signed_documents_candidate_update_own"
  on signed_documents for update
  using (
    application_id in (
      select id from applications
      where candidate_id = auth.uid()
    )
  )
  with check (
    application_id in (
      select id from applications
      where candidate_id = auth.uid()
    )
  );

-- ============================================================
-- TRIGGER: Auto-update applications.updated_at on contract changes
-- ============================================================

create or replace function update_application_timestamp()
returns trigger as $$
begin
  update applications
  set updated_at = now()
  where id = new.application_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_signed_documents_update_application_timestamp on signed_documents;
create trigger trg_signed_documents_update_application_timestamp
after insert or update on signed_documents
for each row
execute function update_application_timestamp();

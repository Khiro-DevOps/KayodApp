-- ============================================================
-- MIGRATION: 20260428_add_job_offer_workflow.sql
-- Add Job Offer Workflow: Proposals, Interviews, Contracts, Device Tokens
-- ============================================================

-- ============================================================
-- 1. UPDATE EXISTING ENUMS
-- ============================================================

-- Update application_status to include new onboarding-related statuses
do $$
begin
  if exists (select 1 from pg_type where typname = 'application_status') then
    -- Drop and recreate with new values
    alter type application_status add value if not exists 'offer_interview_scheduled';
    alter type application_status add value if not exists 'offer_under_negotiation';
    alter type application_status add value if not exists 'contract_sent';
    alter type application_status add value if not exists 'contract_signed';
    alter type application_status add value if not exists 'offer_rejected';
    alter type application_status add value if not exists 'onboarded';
  end if;
end
$$;

-- ============================================================
-- 2. NEW ENUMS FOR JOB OFFER WORKFLOW
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_offer_proposal_status') then
    create type job_offer_proposal_status as enum (
      'draft',
      'sent_to_candidate',
      'accepted',
      'rejected',
      'renegotiate'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contract_status') then
    create type contract_status as enum (
      'draft',
      'sent_to_candidate',
      'signed',
      'rejected'
    );
  end if;
end
$$;

-- ============================================================
-- 3. CREATE TABLES
-- ============================================================

-- TABLE: job_offer_proposals
-- Tracks job offer proposals with negotiation history
create table if not exists job_offer_proposals (
  id                      uuid primary key default uuid_generate_v4(),
  application_id          uuid not null references applications(id) on delete cascade,
  created_by              uuid not null references profiles(id),
  
  -- Chain renegotiations: if this is a new proposal after rejection, point to previous
  previous_proposal_id    uuid references job_offer_proposals(id) on delete set null,
  
  proposal_status         job_offer_proposal_status not null default 'draft',
  
  -- Negotiation terms
  base_salary             numeric(12,2) not null,
  start_date              date not null,
  position_title          text not null,
  benefits_summary        text,
  other_terms             jsonb default '{}'::jsonb,  -- Flexible field for custom points
  
  -- Timestamps
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  sent_at                 timestamptz,
  accepted_at             timestamptz,
  rejected_at             timestamptz
);

create index idx_job_offer_proposals_application_id on job_offer_proposals(application_id);
create index idx_job_offer_proposals_status on job_offer_proposals(proposal_status);

-- TABLE: job_offer_interviews
-- Negotiation meetings scheduled as part of job offer process
create table if not exists job_offer_interviews (
  id                      uuid primary key default uuid_generate_v4(),
  job_offer_proposal_id   uuid not null references job_offer_proposals(id) on delete cascade,
  scheduled_by            uuid not null references profiles(id),
  
  interview_type          interview_type not null default 'online',
  status                  interview_status not null default 'scheduled',
  
  scheduled_at            timestamptz not null,
  duration_minutes        int not null default 60,
  timezone                text not null default 'Asia/Manila',
  
  -- For in-person interviews
  location_address        text,
  location_notes          text,
  
  -- For online interviews (Jitsi)
  video_room_url          text,
  video_room_name         text,
  video_provider          text default 'jitsi',
  
  -- HR notes and scoring
  interviewer_notes       text,
  interview_score         int check (interview_score between 1 and 10),
  
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_job_offer_interviews_proposal_id on job_offer_interviews(job_offer_proposal_id);
create index idx_job_offer_interviews_status on job_offer_interviews(status);

-- TABLE: contract_templates
-- Reusable contract templates with placeholders
create table if not exists contract_templates (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null unique,
  html_template           text not null,  -- HTML with {{salary}}, {{startDate}}, etc. placeholders
  description             text,
  created_by              uuid not null references profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  is_active               boolean not null default true
);

create index idx_contract_templates_is_active on contract_templates(is_active);

-- TABLE: contracts
-- Generated contracts linked to job offer proposals
create table if not exists contracts (
  id                      uuid primary key default uuid_generate_v4(),
  job_offer_proposal_id   uuid not null references job_offer_proposals(id) on delete cascade,
  contract_template_id    uuid not null references contract_templates(id),
  
  version_number          int not null default 1,
  supersedes_contract_id  uuid references contracts(id) on delete set null,
  
  contract_status         contract_status not null default 'draft',
  contract_html           text not null,  -- Rendered HTML with all variables filled in
  pdf_url                 text,            -- Supabase Storage URL to generated PDF
  
  -- Candidate signature capture
  candidate_signature     text,            -- Base64 encoded canvas signature
  signature_timestamp     timestamptz,
  candidate_signed_name   text,            -- Name as typed/signed by candidate
  
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  sent_at                 timestamptz,
  signed_at               timestamptz,
  
  constraint unique_contract_version 
    unique (job_offer_proposal_id, version_number)
);

create index idx_contracts_proposal_id on contracts(job_offer_proposal_id);
create index idx_contracts_status on contracts(contract_status);
create index idx_contracts_version_chain on contracts(supersedes_contract_id);

-- TABLE: fcm_device_tokens
-- Store FCM device tokens for push notifications
create table if not exists fcm_device_tokens (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references profiles(id) on delete cascade,
  device_token            text not null unique,
  device_type             text not null,  -- 'web', 'ios', 'android'
  device_name             text,
  is_active               boolean not null default true,
  last_used_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_fcm_device_tokens_user_id on fcm_device_tokens(user_id);
create index idx_fcm_device_tokens_is_active on fcm_device_tokens(is_active);
create unique index idx_fcm_device_tokens_user_device_unique 
  on fcm_device_tokens(user_id, device_token) where is_active = true;

-- ============================================================
-- 4. UPDATE APPLICATIONS TABLE
-- ============================================================

-- Add onboarding confirmation fields to applications
alter table applications add column if not exists onboarding_confirmed_at timestamptz;
alter table applications add column if not exists onboarding_confirmed_by uuid references profiles(id);

-- ============================================================
-- 5. DATABASE TRIGGERS FOR JOB OFFER NOTIFICATIONS
-- ============================================================

-- Function: notify_job_offer_sent
-- Triggered when job offer proposal status changes to sent_to_candidate
create or replace function notify_job_offer_sent()
returns trigger as $$
declare
  candidate_id uuid;
  job_posting_id uuid;
  app_record record;
begin
  if new.proposal_status = 'sent_to_candidate' and old.proposal_status != 'sent_to_candidate' then
    -- Get candidate_id and job_posting_id from application
    select a.candidate_id, a.job_posting_id into candidate_id, job_posting_id
    from applications a
    where a.id = new.application_id;
    
    -- Insert notification
    insert into notifications (recipient_id, type, title, body, action_url, read)
    values (
      candidate_id,
      'offer_letter'::notification_type,
      'New Job Offer',
      'You have received a new job offer. Review the details and respond.',
      '/applications/' || new.application_id || '/job-offer/review',
      false
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_offer_sent_trigger on job_offer_proposals;
create trigger job_offer_sent_trigger
  after update on job_offer_proposals
  for each row
  execute function notify_job_offer_sent();

-- Function: notify_job_offer_interview_scheduled
create or replace function notify_job_offer_interview_scheduled()
returns trigger as $$
declare
  candidate_id uuid;
  proposal_record record;
begin
  if new.status = 'scheduled' and old.status is null then
    -- Get candidate_id via proposal -> application
    select p.application_id into candidate_id
    from job_offer_proposals p
    where p.id = new.job_offer_proposal_id;
    
    select a.candidate_id into candidate_id
    from applications a
    where a.id = candidate_id;
    
    insert into notifications (recipient_id, type, title, body, action_url, read)
    values (
      candidate_id,
      'interview_scheduled'::notification_type,
      'Job Offer Interview Scheduled',
      'Your job offer negotiation interview has been scheduled.',
      '/applications/' || candidate_id || '/job-offer/review',
      false
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_offer_interview_scheduled_trigger on job_offer_interviews;
create trigger job_offer_interview_scheduled_trigger
  after insert on job_offer_interviews
  for each row
  execute function notify_job_offer_interview_scheduled();

-- Function: notify_contract_sent
create or replace function notify_contract_sent()
returns trigger as $$
declare
  candidate_id uuid;
  app_id uuid;
begin
  if new.contract_status = 'sent_to_candidate' and old.contract_status != 'sent_to_candidate' then
    -- Get candidate_id from contract -> proposal -> application
    select jop.application_id into app_id
    from job_offer_proposals jop
    where jop.id = new.job_offer_proposal_id;
    
    select a.candidate_id into candidate_id
    from applications a
    where a.id = app_id;
    
    insert into notifications (recipient_id, type, title, body, action_url, read)
    values (
      candidate_id,
      'offer_letter'::notification_type,
      'Contract Ready for Review',
      'Your employment contract is ready for review and digital signature.',
      '/applications/' || app_id || '/contract/sign',
      false
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists contract_sent_trigger on contracts;
create trigger contract_sent_trigger
  after update on contracts
  for each row
  execute function notify_contract_sent();

-- Function: notify_contract_signed
create or replace function notify_contract_signed()
returns trigger as $$
declare
  candidate_id uuid;
  app_id uuid;
  hr_id uuid;
begin
  if new.contract_status = 'signed' and old.contract_status != 'signed' then
    -- Get candidate_id from contract -> proposal -> application
    select jop.application_id into app_id
    from job_offer_proposals jop
    where jop.id = new.job_offer_proposal_id;
    
    select a.candidate_id, a.job_posting_id into candidate_id, hr_id
    from applications a
    where a.id = app_id;
    
    -- Get job posting owner (HR)
    select jp.created_by into hr_id
    from job_postings jp
    where jp.id = (select job_posting_id from applications where id = app_id);
    
    -- Notify HR that contract was signed
    insert into notifications (recipient_id, type, title, body, action_url, read)
    values (
      hr_id,
      'offer_letter'::notification_type,
      'Contract Signed',
      'The candidate has signed their employment contract.',
      '/applications/' || app_id || '/job-offer/confirm-hire',
      false
    );
    
    -- Update application status to contract_signed
    update applications set status = 'contract_signed'::application_status, updated_at = now()
    where id = app_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists contract_signed_trigger on contracts;
create trigger contract_signed_trigger
  after update on contracts
  for each row
  execute function notify_contract_signed();

-- Function: notify_offer_rejected
create or replace function notify_offer_rejected()
returns trigger as $$
declare
  candidate_id uuid;
  app_id uuid;
  hr_id uuid;
begin
  if new.proposal_status = 'rejected' and old.proposal_status != 'rejected' then
    select a.candidate_id, a.job_posting_id into candidate_id, app_id
    from applications a
    where a.id = new.application_id;
    
    select jp.created_by into hr_id
    from job_postings jp
    where jp.id = app_id;
    
    -- Notify HR
    insert into notifications (recipient_id, type, title, body, action_url, read)
    values (
      hr_id,
      'offer_letter'::notification_type,
      'Offer Rejected',
      'The candidate has rejected the job offer.',
      '/applications/' || new.application_id,
      false
    );
    
    -- Update application status
    update applications set status = 'offer_rejected'::application_status, updated_at = now()
    where id = new.application_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists offer_rejected_trigger on job_offer_proposals;
create trigger offer_rejected_trigger
  after update on job_offer_proposals
  for each row
  execute function notify_offer_rejected();

-- ============================================================
-- 6. SEED CONTRACT TEMPLATE
-- ============================================================

insert into contract_templates (name, html_template, description, created_by, is_active)
select
  'Standard Employment Contract',
  '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h1>EMPLOYMENT CONTRACT</h1>
    <p>This Employment Agreement is entered into as of <strong>{{signDate}}</strong> between <strong>Kayod Inc.</strong> and <strong>{{candidateName}}</strong>.</p>
    
    <h2>1. POSITION AND DUTIES</h2>
    <p>Employee will serve as <strong>{{positionTitle}}</strong> reporting to management as directed.</p>
    
    <h2>2. EMPLOYMENT TERMS</h2>
    <ul>
      <li><strong>Start Date:</strong> {{startDate}}</li>
      <li><strong>Employment Type:</strong> Full-time</li>
      <li><strong>Base Salary:</strong> {{baseSalary}} per month</li>
    </ul>
    
    <h2>3. BENEFITS AND COMPENSATION</h2>
    <p>{{benefitsSummary}}</p>
    
    <h2>4. ADDITIONAL TERMS</h2>
    <p>{{otherTerms}}</p>
    
    <h2>5. AT-WILL EMPLOYMENT</h2>
    <p>Employment is at-will and may be terminated by either party with appropriate notice as per company policy.</p>
    
    <p style="margin-top: 40px;">
      <strong>Employee Signature: ___________________________</strong><br>
      Date: {{signatureDate}}
    </p>
  </div>',
  'Standard full-time employment contract with position, salary, and benefits',
  (select id from profiles where email = 'admin@kayod.com' limit 1),
  true
on conflict do nothing;

-- ============================================================
-- 7. STORAGE BUCKET FOR ATTACHMENTS (Contract PDFs)
-- Note: Run in Supabase Dashboard Storage > Create Bucket
-- Bucket name: attachments
-- Policy: Enable public read, private write (HR/System)
-- ============================================================

-- This is handled in Supabase Dashboard, commented for reference
-- create storage.buckets (id, name, owner, public) values ('attachments', 'attachments', null, false);

-- ============================================================
-- 8. RLS POLICIES FOR NEW TABLES
-- ============================================================

-- fcm_device_tokens
alter table fcm_device_tokens enable row level security;

create policy "Users can view own FCM tokens" on fcm_device_tokens
  for select using (auth.uid() = user_id);

create policy "Users can insert own FCM tokens" on fcm_device_tokens
  for insert with check (auth.uid() = user_id);

create policy "Users can update own FCM tokens" on fcm_device_tokens
  for update using (auth.uid() = user_id);

-- job_offer_proposals
alter table job_offer_proposals enable row level security;

create policy "HR can view and create job offer proposals" on job_offer_proposals
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
  );

create policy "Candidates can view their own job offers" on job_offer_proposals
  for select using (
    exists (select 1 from applications where id = application_id and candidate_id = auth.uid())
  );

-- job_offer_interviews
alter table job_offer_interviews enable row level security;

create policy "HR can manage job offer interviews" on job_offer_interviews
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
  );

create policy "Candidates can view their job offer interviews" on job_offer_interviews
  for select using (
    exists (
      select 1 from job_offer_proposals jop
      join applications a on a.id = jop.application_id
      where jop.id = job_offer_proposal_id and a.candidate_id = auth.uid()
    )
  );

-- contracts
alter table contracts enable row level security;

create policy "HR can manage contracts" on contracts
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
  );

create policy "Candidates can view and sign their contracts" on contracts
  for select using (
    exists (
      select 1 from job_offer_proposals jop
      join applications a on a.id = jop.application_id
      where jop.id = job_offer_proposal_id and a.candidate_id = auth.uid()
    )
  );

create policy "Candidates can update their contract signature" on contracts
  for update using (
    exists (
      select 1 from job_offer_proposals jop
      join applications a on a.id = jop.application_id
      where jop.id = job_offer_proposal_id and a.candidate_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from job_offer_proposals jop
      join applications a on a.id = jop.application_id
      where jop.id = job_offer_proposal_id and a.candidate_id = auth.uid()
    )
  );

-- contract_templates
alter table contract_templates enable row level security;

create policy "Anyone can view active contract templates" on contract_templates
  for select using (is_active = true);

create policy "HR can manage contract templates" on contract_templates
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('hr_manager', 'admin'))
  );

-- ============================================================
-- END OF MIGRATION
-- ============================================================

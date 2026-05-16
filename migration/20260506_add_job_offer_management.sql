-- ============================================================
-- KAYOD HRIS — Job Offer Management Schema
-- Adds JobOffer and NegotiationRequest tables for offer workflow
-- ============================================================

-- ============================================================
-- CREATE JOB_OFFER ENUM TYPE
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_offer_status') then
    create type job_offer_status as enum ('pending', 'accepted', 'negotiating', 'declined', 'expired');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'negotiation_status') then
    create type negotiation_status as enum ('pending', 'approved', 'countered', 'declined');
  end if;
end
$$;

-- ============================================================
-- CREATE JOB_OFFERS TABLE
-- Core offer record with all terms and DocuSeal integration
-- Note: Using job_offer_applications to avoid conflicts with existing job_offers table
-- ============================================================

create table if not exists job_offer_applications (
  id                    uuid primary key default uuid_generate_v4(),
  application_id        uuid not null unique references applications(id) on delete cascade,
  applicant_id          uuid not null references profiles(id) on delete cascade,
  hr_id                 uuid not null references profiles(id) on delete restrict,
  
  -- DocuSeal Integration
  template_id           text not null,                          -- DocuSeal template ID
  submission_id         text,                                   -- DocuSeal submission ID (set on Accept)
  signed_pdf_url        text,                                   -- URL to signed PDF (from webhook)
  
  -- Offer Details
  status                job_offer_status not null default 'pending',
  version               int not null default 1,                 -- Increments on revision
  terms                 jsonb not null,                         -- { salary, currency, employmentType, startDate, workArrangement, department, manager, benefits[], notes }
  
  -- Expiry & Tracking
  expires_at            timestamp with time zone not null,
  issued_at             timestamp with time zone not null default now(),
  viewed_at             timestamp with time zone,               -- First time applicant opens page
  accepted_at           timestamp with time zone,               -- When applicant signs
  
  negotiation_round     int not null default 0,                 -- Current round (max 3)
  
  created_at            timestamp with time zone default now(),
  updated_at            timestamp with time zone default now()
);

create index if not exists idx_job_offer_apps_application_id on job_offer_applications(application_id);
create index if not exists idx_job_offer_apps_applicant_id on job_offer_applications(applicant_id);
create index if not exists idx_job_offer_apps_hr_id on job_offer_applications(hr_id);
create index if not exists idx_job_offer_apps_status on job_offer_applications(status);
create index if not exists idx_job_offer_apps_expires_at on job_offer_applications(expires_at) where status in ('pending', 'negotiating');

-- ============================================================
-- CREATE NEGOTIATION_REQUESTS TABLE
-- Tracks all negotiation rounds per offer
-- ============================================================

create table if not exists negotiation_requests (
  id                    uuid primary key default uuid_generate_v4(),
  offer_id              uuid not null references job_offer_applications(id) on delete cascade,
  round                 int not null,                           -- 1, 2, or 3
  
  submitted_by          uuid not null references profiles(id),  -- applicant ID
  
  -- Negotiation items
  items                 jsonb[] not null,                       -- [{ term, currentValue, requestedValue, reason }]
  
  -- HR Response
  status                negotiation_status not null default 'pending',
  hr_response           jsonb,                                  -- { itemIndex: { action, counterValue, notes } }
  
  submitted_at          timestamp with time zone not null default now(),
  responded_at          timestamp with time zone,
  
  created_at            timestamp with time zone default now(),
  updated_at            timestamp with time zone default now()
);

create index if not exists idx_negotiation_requests_offer_id on negotiation_requests(offer_id);
create index if not exists idx_negotiation_requests_round on negotiation_requests(offer_id, round);
create index if not exists idx_negotiation_requests_status on negotiation_requests(status);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table job_offer_applications enable row level security;
alter table negotiation_requests enable row level security;

-- ============================================================
-- CREATE RLS POLICIES FOR job_offer_applications
-- ============================================================

-- Applicant can view their own offers
drop policy if exists "job_offer_apps_applicant_view_own" on job_offer_applications;
create policy "job_offer_apps_applicant_view_own"
  on job_offer_applications for select
  using (applicant_id = auth.uid());

-- HR can view offers they created
drop policy if exists "job_offer_apps_hr_view_own" on job_offer_applications;
create policy "job_offer_apps_hr_view_own"
  on job_offer_applications for select
  using (
    hr_id = auth.uid() or
    exists(
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'admin'
    )
  );

-- Applicant can update their own offers (to mark as viewed, accepted, declined)
drop policy if exists "job_offer_apps_applicant_update_own" on job_offer_applications;
create policy "job_offer_apps_applicant_update_own"
  on job_offer_applications for update
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid());

-- HR can update their own offers
drop policy if exists "job_offer_apps_hr_update_own" on job_offer_applications;
create policy "job_offer_apps_hr_update_own"
  on job_offer_applications for update
  using (hr_id = auth.uid())
  with check (hr_id = auth.uid());

-- HR can insert offers
drop policy if exists "job_offer_apps_hr_insert" on job_offer_applications;
create policy "job_offer_apps_hr_insert"
  on job_offer_applications for insert
  with check (
    hr_id = auth.uid() and
    exists(
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role in ('hr_manager', 'admin')
    )
  );

-- ============================================================
-- CREATE RLS POLICIES FOR negotiation_requests
-- ============================================================

-- Applicant can view their own negotiation requests
drop policy if exists "negotiation_requests_applicant_view_own" on negotiation_requests;
create policy "negotiation_requests_applicant_view_own"
  on negotiation_requests for select
  using (
    submitted_by = auth.uid() or
    offer_id in (
      select id from job_offer_applications
      where applicant_id = auth.uid()
    )
  );

-- HR can view negotiation requests for their offers
drop policy if exists "negotiation_requests_hr_view_own" on negotiation_requests;
create policy "negotiation_requests_hr_view_own"
  on negotiation_requests for select
  using (
    offer_id in (
      select id from job_offer_applications
      where hr_id = auth.uid()
    )
  );

-- Applicant can insert negotiation requests
drop policy if exists "negotiation_requests_applicant_insert" on negotiation_requests;
create policy "negotiation_requests_applicant_insert"
  on negotiation_requests for insert
  with check (
    submitted_by = auth.uid() and
    offer_id in (
      select id from job_offer_applications
      where applicant_id = auth.uid()
    )
  );

-- HR can update negotiation requests (to respond)
drop policy if exists "negotiation_requests_hr_update" on negotiation_requests;
create policy "negotiation_requests_hr_update"
  on negotiation_requests for update
  using (
    offer_id in (
      select id from job_offer_applications
      where hr_id = auth.uid()
    )
  )
  with check (
    offer_id in (
      select id from job_offer_applications
      where hr_id = auth.uid()
    )
  );

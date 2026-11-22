-- ============================================================
-- SEED: 10 Realistic Philippine Job Listings for Kayod HRIS
-- File: supabase/seeds/20261126_seed_10_job_listings.sql
-- Safe to run repeatedly in Supabase SQL Editor (100% idempotent).
-- ============================================================

DO $$
DECLARE
  v_tenant_id uuid;
  v_created_by uuid;

  -- Department IDs
  v_dept_engineering uuid;
  v_dept_platform uuid;
  v_dept_design uuid;
  v_dept_people uuid;
  v_dept_qa uuid;
  v_dept_client_ops uuid;
  v_dept_marketing uuid;
  v_dept_finance uuid;
  v_dept_data_ai uuid;

  -- Location IDs
  v_prov_cebu uuid;
  v_prov_ncr uuid;
  v_city_cebu uuid;
  v_city_mandaue uuid;
  v_city_makati uuid;
  v_city_taguig uuid;
BEGIN
  -- 1. Ensure optional columns exist on public.job_postings across schema revisions
  ALTER TABLE IF EXISTS public.job_postings
    ADD COLUMN IF NOT EXISTS tenant_id uuid,
    ADD COLUMN IF NOT EXISTS min_experience int DEFAULT 0,
    ADD COLUMN IF NOT EXISTS offer_letter_settings jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'fixed',
    ADD COLUMN IF NOT EXISTS rest_days_type text DEFAULT 'fixed',
    ADD COLUMN IF NOT EXISTS shift_start time DEFAULT '09:00',
    ADD COLUMN IF NOT EXISTS shift_end time DEFAULT '18:00',
    ADD COLUMN IF NOT EXISTS work_days text[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'];

  -- 2. Resolve active tenant_id (preferring 'SG Engineering', else first tenant)
  IF to_regclass('public.tenants') IS NOT NULL THEN
    SELECT t.id INTO v_tenant_id
    FROM public.tenants t
    WHERE t.name ILIKE '%SG Engineering%'
    ORDER BY t.created_at ASC
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
      SELECT p.tenant_id INTO v_tenant_id
      FROM public.profiles p
      WHERE p.role::text IN ('hr_manager', 'admin')
        AND p.tenant_id IS NOT NULL
      ORDER BY p.created_at ASC
      LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
      SELECT t.id INTO v_tenant_id
      FROM public.tenants t
      ORDER BY t.created_at ASC
      LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
      INSERT INTO public.tenants (name, plan)
      VALUES ('SG Engineering', 'growth')
      RETURNING id INTO v_tenant_id;
    END IF;
  END IF;

  -- 3. Resolve created_by HR / Admin profile ID
  SELECT p.id INTO v_created_by
  FROM public.profiles p
  WHERE p.role::text IN ('hr_manager', 'admin')
    AND (v_tenant_id IS NULL OR p.tenant_id = v_tenant_id)
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_created_by IS NULL THEN
    SELECT p.id INTO v_created_by
    FROM public.profiles p
    WHERE p.role::text IN ('hr_manager', 'admin')
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_created_by IS NULL THEN
    SELECT p.id INTO v_created_by
    FROM public.profiles p
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Cannot seed job_postings: no row exists in public.profiles to satisfy created_by FK.';
  END IF;

  -- Ensure the resolved HR profile is linked to v_tenant_id if missing
  IF v_tenant_id IS NOT NULL THEN
    UPDATE public.profiles
    SET tenant_id = COALESCE(tenant_id, v_tenant_id)
    WHERE id = v_created_by
      AND tenant_id IS NULL;
  END IF;

  -- 4. Upsert Departments and capture IDs
  INSERT INTO public.departments (name, description) VALUES
    ('Engineering',               'Software architecture, full-stack, and backend engineering'),
    ('Platform & Infrastructure', 'Cloud infrastructure, DevOps, SRE, and platform reliability'),
    ('Design & Product',          'UI/UX design, product strategy, and user research'),
    ('People & Culture',          'Human resources, talent acquisition, and Philippine payroll operations'),
    ('Quality Engineering',       'Automated testing, quality assurance, and release readiness'),
    ('Client Operations',         'Customer success, technical account management, and enterprise support'),
    ('Marketing',                 'Digital marketing, demand generation, brand, and growth'),
    ('Finance',                   'Accounting, BIR tax compliance, audit, and financial control'),
    ('Data & AI',                 'Data engineering, machine learning, and AI pipeline systems')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_dept_engineering FROM public.departments WHERE name = 'Engineering' LIMIT 1;
  SELECT id INTO v_dept_platform    FROM public.departments WHERE name = 'Platform & Infrastructure' LIMIT 1;
  SELECT id INTO v_dept_design      FROM public.departments WHERE name = 'Design & Product' LIMIT 1;
  SELECT id INTO v_dept_people      FROM public.departments WHERE name = 'People & Culture' LIMIT 1;
  SELECT id INTO v_dept_qa          FROM public.departments WHERE name = 'Quality Engineering' LIMIT 1;
  SELECT id INTO v_dept_client_ops  FROM public.departments WHERE name = 'Client Operations' LIMIT 1;
  SELECT id INTO v_dept_marketing   FROM public.departments WHERE name = 'Marketing' LIMIT 1;
  SELECT id INTO v_dept_finance     FROM public.departments WHERE name = 'Finance' LIMIT 1;
  SELECT id INTO v_dept_data_ai     FROM public.departments WHERE name = 'Data & AI' LIMIT 1;

  -- 5. Resolve or seed standardized Philippine locations in public.locations
  IF to_regclass('public.locations') IS NOT NULL THEN
    SELECT id INTO v_prov_cebu FROM public.locations WHERE location_type = 'province' AND name ILIKE 'Cebu' LIMIT 1;
    IF v_prov_cebu IS NULL THEN
      INSERT INTO public.locations (name, location_type) VALUES ('Cebu', 'province') RETURNING id INTO v_prov_cebu;
    END IF;

    SELECT id INTO v_prov_ncr FROM public.locations WHERE location_type = 'province' AND name ILIKE '%Metro Manila%' LIMIT 1;
    IF v_prov_ncr IS NULL THEN
      INSERT INTO public.locations (name, location_type) VALUES ('Metro Manila', 'province') RETURNING id INTO v_prov_ncr;
    END IF;

    SELECT id INTO v_city_cebu FROM public.locations WHERE location_type = 'city' AND name ILIKE 'Cebu City' LIMIT 1;
    IF v_city_cebu IS NULL THEN
      INSERT INTO public.locations (name, location_type, parent_id) VALUES ('Cebu City', 'city', v_prov_cebu) RETURNING id INTO v_city_cebu;
    END IF;

    SELECT id INTO v_city_mandaue FROM public.locations WHERE location_type = 'city' AND name ILIKE 'Mandaue City' LIMIT 1;
    IF v_city_mandaue IS NULL THEN
      INSERT INTO public.locations (name, location_type, parent_id) VALUES ('Mandaue City', 'city', v_prov_cebu) RETURNING id INTO v_city_mandaue;
    END IF;

    SELECT id INTO v_city_makati FROM public.locations WHERE location_type = 'city' AND name ILIKE 'Makati City' LIMIT 1;
    IF v_city_makati IS NULL THEN
      INSERT INTO public.locations (name, location_type, parent_id) VALUES ('Makati City', 'city', v_prov_ncr) RETURNING id INTO v_city_makati;
    END IF;

    SELECT id INTO v_city_taguig FROM public.locations WHERE location_type = 'city' AND name ILIKE 'Taguig City%' LIMIT 1;
    IF v_city_taguig IS NULL THEN
      INSERT INTO public.locations (name, location_type, parent_id) VALUES ('Taguig City', 'city', v_prov_ncr) RETURNING id INTO v_city_taguig;
    END IF;
  END IF;

  -- 6. Seed 10 realistic Philippine job listings (deterministic UUIDs, idempotent upsert)
  INSERT INTO public.job_postings (
    id,
    tenant_id,
    department_id,
    created_by,
    title,
    description,
    requirements,
    responsibilities,
    location,
    is_remote,
    work_setup,
    city_id,
    province_id,
    employment_type,
    salary_min,
    salary_max,
    currency,
    slots,
    is_published,
    published_at,
    closes_at,
    industry,
    job_category,
    required_skills,
    min_experience,
    schedule_type,
    rest_days_type,
    shift_start,
    shift_end,
    work_days,
    offer_letter_settings
  )
  VALUES
    -- 1. Senior Full-Stack Engineer (Next.js & Supabase)
    (
      '11111111-2222-4333-8444-000000000001'::uuid,
      v_tenant_id,
      v_dept_engineering,
      v_created_by,
      'Senior Full-Stack Engineer (Next.js & Supabase)',
      'We are looking for a Senior Full-Stack Engineer in Cebu City to lead core feature development across our multi-tenant SaaS HRIS & Payroll platform. You will architect resilient App Router workflows in Next.js, design PostgreSQL schemas and Row-Level Security (RLS) policies in Supabase, and collaborate closely with product and design to ship high-impact releases for Philippine enterprises.',
      E'• 5+ years of professional software engineering experience building production web applications\n• Deep proficiency in TypeScript, React, Next.js (App Router, Server Actions, SSR), and Tailwind CSS\n• Strong relational database design skills with PostgreSQL and Supabase (Auth, RLS, Storage, Edge Functions)\n• Proven track record designing secure REST/RPC APIs, background jobs, and third-party webhook integrations\n• Experience mentoring junior developers and conducting thorough code reviews',
      E'• Architect, build, and maintain end-to-end product modules across HRIS, timekeeping, payroll, and applicant tracking\n• Write and optimize PostgreSQL queries, database migrations, and tenant-isolated RLS policies\n• Partner with UI/UX designers to deliver responsive, accessible desktop and mobile PWA experiences\n• Drive technical standards, automated test coverage, and production observability',
      'Cebu City, Cebu',
      false,
      'hybrid'::public.work_setup,
      v_city_cebu,
      v_prov_cebu,
      'full_time'::public.employment_type,
      95000.00,
      135000.00,
      'PHP',
      2,
      true,
      now() - interval '3 days',
      now() + interval '60 days',
      'it',
      'Full Stack Developer',
      ARRAY['Next.js', 'TypeScript', 'React', 'Supabase', 'PostgreSQL', 'Tailwind CSS', 'Node.js', 'REST APIs'],
      5,
      'fixed',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Engineering',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1 + 2 Dependents)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1 + 2 Dependents)',
          'Rice Subsidy (₱2,500/mo)',
          'Communication / Internet Allowance (₱2,500/mo)',
          'Performance / KPI Bonus (₱5,000/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2500),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 2500),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 5000),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', jsonb_build_array(
            jsonb_build_object('id', 'learning-stipend', 'label', 'Annual Tech & Certification Stipend', 'amount', 3000, 'kind', 'allowance', 'enabled', true)
          )
        )
      )
    ),

    -- 2. DevOps & Cloud Infrastructure Specialist
    (
      '11111111-2222-4333-8444-000000000002'::uuid,
      v_tenant_id,
      v_dept_platform,
      v_created_by,
      'DevOps & Cloud Infrastructure Specialist',
      'Join our Platform & Infrastructure team remotely from anywhere in the Philippines. You will own CI/CD automation, cloud security, container orchestration, and database reliability for high-availability enterprise workloads serving thousands of daily active users.',
      E'• 4+ years of hands-on experience in DevOps, Site Reliability Engineering (SRE), or Cloud Infrastructure\n• Strong expertise with AWS or GCP, Docker, Kubernetes, and Infrastructure-as-Code (Terraform)\n• Proven experience building automated CI/CD pipelines with GitHub Actions\n• Solid understanding of PostgreSQL backups, replication, connection pooling, and zero-downtime migrations\n• Familiarity with observability stacks (Prometheus, Grafana, Sentry, OpenTelemetry)',
      E'• Design, provision, and harden cloud infrastructure using Terraform and containerized deployments\n• Maintain fast, deterministic GitHub Actions CI/CD workflows with automated security and quality gates\n• Monitor system health, latency, and database performance, leading incident response and post-mortems\n• Implement secrets management, WAF rules, and disaster recovery runbooks compliant with ISO 27001 / NPC standards',
      'Remote (Philippines)',
      true,
      'remote'::public.work_setup,
      v_city_cebu,
      v_prov_cebu,
      'full_time'::public.employment_type,
      90000.00,
      125000.00,
      'PHP',
      1,
      true,
      now() - interval '2 days',
      now() + interval '60 days',
      'it',
      'DevOps Engineer',
      ARRAY['AWS', 'Terraform', 'Docker', 'Kubernetes', 'GitHub Actions', 'PostgreSQL', 'Linux', 'CI/CD'],
      4,
      'flexible',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Platform & Infrastructure',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Medicard HMO (Day 1 + 1 Dependent)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Communication / Internet Allowance (₱3,000/mo)',
          'WFH Power & Equipment Allowance (₱2,500/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 3000),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 4000),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', jsonb_build_array(
            jsonb_build_object('id', 'wfh-power', 'label', 'WFH Power & Equipment Allowance', 'amount', 2500, 'kind', 'allowance', 'enabled', true)
          )
        )
      )
    ),

    -- 3. UI/UX Product Designer
    (
      '11111111-2222-4333-8444-000000000003'::uuid,
      v_tenant_id,
      v_dept_design,
      v_created_by,
      'UI/UX Product Designer',
      'We are seeking a user-obsessed UI/UX Product Designer based in Mandaue City, Cebu to craft intuitive, mobile-first enterprise experiences. You will own the design system in Figma, conduct usability testing with HR teams and frontline Filipino workers, and translate complex payroll and attendance workflows into clean interfaces.',
      E'• 3+ years of product design experience for web and mobile applications (SaaS, FinTech, or B2B preferred)\n• Expert command of Figma (Auto Layout, Variants, Design Tokens, Interactive Prototyping)\n• Strong portfolio demonstrating end-to-end UX process: user flows, wireframes, high-fidelity UI, and design systems\n• Working knowledge of WCAG accessibility standards, responsive grid layouts, and Tailwind/CSS fundamentals\n• Empathy for non-technical users navigating mobile PWAs on low-bandwidth connections',
      E'• Lead end-to-end design for new product initiatives from discovery and user research to developer handoff\n• Maintain and evolve our unified Material 3 / Tailwind component library and design tokens\n• Conduct prototype walkthroughs and usability sessions with HR managers, employees, and job applicants\n• Partner directly with frontend engineers during implementation to ensure pixel-accurate UI quality',
      'Mandaue City, Cebu',
      false,
      'hybrid'::public.work_setup,
      v_city_mandaue,
      v_prov_cebu,
      'full_time'::public.employment_type,
      55000.00,
      80000.00,
      'PHP',
      1,
      true,
      now() - interval '4 days',
      now() + interval '45 days',
      'it',
      'Product Manager',
      ARRAY['Figma', 'UI/UX Design', 'Design Systems', 'Prototyping', 'User Research', 'Wireframing', 'Mobile PWA', 'Accessibility'],
      3,
      'fixed',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Design & Product',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Communication / Internet Allowance (₱1,500/mo)',
          'Transportation / Fuel Allowance (₱1,500/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', false, 'amount', 0),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 4. HR & Payroll Operations Specialist
    (
      '11111111-2222-4333-8444-000000000004'::uuid,
      v_tenant_id,
      v_dept_people,
      v_created_by,
      'HR & Payroll Operations Specialist',
      'We are hiring a detail-oriented HR & Payroll Operations Specialist for our Mandaue City headquarters. You will manage end-to-end semi-monthly payroll processing, Philippine statutory remittances (SSS, PhilHealth, Pag-IBIG, BIR withholding tax), pre-employment onboarding verification, and timekeeping reconciliation.',
      E'• Bachelor''s degree in Human Resource Management, Psychology, Accountancy, or Business Administration\n• 2+ years of hands-on Philippine payroll processing and HR generalist experience\n• Thorough knowledge of the Philippine Labor Code, DOLE compliance, PD 851 (13th-month pay), overtime, night differential, and holiday pay computation\n• Experience filing statutory contributions and loans via SSS, PhilHealth (EPRS), Pag-IBIG, and BIR Alphalist/2316\n• High proficiency in HRIS platforms and Microsoft Excel / Google Sheets',
      E'• Process accurate and timely semi-monthly payroll, overtime, leave conversions, and final pay computations\n• Audit daily attendance logs, geofence clock-in exceptions, and approved overtime/leave requests\n• Oversee pre-employment 201 file compliance (NBI, BIR 2316/1902, SSS, PhilHealth, Pag-IBIG, PEME) for new hires\n• Assist employees with government benefit claims, HMO enrollment, and certificate of employment requests',
      'Mandaue City, Cebu',
      false,
      'onsite'::public.work_setup,
      v_city_mandaue,
      v_prov_cebu,
      'full_time'::public.employment_type,
      38000.00,
      52000.00,
      'PHP',
      2,
      true,
      now() - interval '1 day',
      now() + interval '45 days',
      'hr',
      'HR Specialist',
      ARRAY['Philippine Payroll', 'DOLE Compliance', 'SSS PhilHealth Pag-IBIG', 'BIR 2316', 'HRIS', 'Timekeeping', 'Onboarding', 'Employee Relations'],
      2,
      'fixed',
      'fixed',
      '08:30'::time,
      '17:30'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'People & Culture',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Transportation / Fuel Allowance (₱1,500/mo)',
          'Meal Allowance (₱1,500/mo)',
          'Perfect Attendance Incentive (₱2,000/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'internet_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'meal_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'clothing_allowance', jsonb_build_object('enabled', true, 'amount', 500),
          'attendance_incentive', jsonb_build_object('enabled', true, 'amount', 2000),
          'performance_bonus', jsonb_build_object('enabled', false, 'amount', 0),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 5. QA Automation Engineer (Playwright & TypeScript)
    (
      '11111111-2222-4333-8444-000000000005'::uuid,
      v_tenant_id,
      v_dept_qa,
      v_created_by,
      'QA Automation Engineer (Playwright & TypeScript)',
      'We are looking for a QA Automation Engineer in Cebu City (Work-From-Home setup) to safeguard release quality across our web and mobile PWA portals. You will build end-to-end Playwright test suites in TypeScript, validate multi-role RBAC permissions, and automate regression checks for payroll and attendance calculations.',
      E'• 3+ years of software quality assurance experience with at least 2 years in automated E2E testing\n• Strong hands-on proficiency with Playwright or Cypress using TypeScript/JavaScript\n• Experience testing REST APIs, database state assertions (PostgreSQL/Supabase), and multi-role authentication flows\n• Familiarity with integrating automated test suites into GitHub Actions CI pipelines\n• Strong analytical mindset for edge-case discovery in financial, payroll, and scheduling logic',
      E'• Develop, maintain, and scale automated E2E and API test suites using Playwright and TypeScript\n• Execute regression, smoke, and cross-browser/mobile viewport testing prior to production deployments\n• Collaborate with developers to reproduce defects, write deterministic regression tests, and prevent escaped bugs\n• Track quality metrics, test coverage, and release readiness across sprints',
      'Cebu City, Cebu',
      false,
      'wfh'::public.work_setup,
      v_city_cebu,
      v_prov_cebu,
      'full_time'::public.employment_type,
      60000.00,
      85000.00,
      'PHP',
      2,
      true,
      now() - interval '5 days',
      now() + interval '60 days',
      'it',
      'QA Engineer',
      ARRAY['Playwright', 'TypeScript', 'E2E Testing', 'API Testing', 'GitHub Actions', 'PostgreSQL', 'Test Automation', 'QA'],
      3,
      'fixed',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Quality Engineering',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Communication / Internet Allowance (₱2,500/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 2500),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 2500),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 6. Customer Success & Technical Support Lead
    (
      '11111111-2222-4333-8444-000000000006'::uuid,
      v_tenant_id,
      v_dept_client_ops,
      v_created_by,
      'Customer Success & Technical Support Lead',
      'We are expanding our Luzon client operations and seeking a Customer Success & Technical Support Lead based in Makati City, Metro Manila. You will guide enterprise HR teams through onboarding, configure company branches and payroll policies, and serve as the primary escalation point for technical and product inquiries.',
      E'• 3+ years of experience in SaaS Customer Success, Technical Account Management, or B2B Application Support\n• Strong understanding of Philippine HR, timekeeping, or payroll workflows\n• Ability to troubleshoot web/mobile PWA issues, inspect browser logs, and run basic SQL/admin diagnostics\n• Excellent written and verbal communication skills in English and Filipino/Tagalog\n• Proven ability to lead live client training webinars and executive business reviews',
      E'• Lead end-to-end onboarding and workspace configuration for new Philippine enterprise clients\n• Manage L2 technical support escalations, partnering with engineering to resolve product issues swiftly\n• Author help center documentation, video tutorials, and release notes for HR administrators\n• Monitor client health scores, adoption metrics, and renewal satisfaction',
      'Makati City, Metro Manila',
      false,
      'hybrid'::public.work_setup,
      v_city_makati,
      v_prov_ncr,
      'full_time'::public.employment_type,
      45000.00,
      65000.00,
      'PHP',
      2,
      true,
      now() - interval '2 days',
      now() + interval '45 days',
      'operations',
      'Operations Manager',
      ARRAY['Customer Success', 'Technical Support', 'SaaS Onboarding', 'HRIS', 'Client Training', 'SQL Basics', 'SLA Management'],
      3,
      'fixed',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Client Operations',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Medicard HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Transportation / Fuel Allowance (₱2,000/mo)',
          'Communication / Internet Allowance (₱1,500/mo)',
          'Performance / KPI Bonus (₱3,000/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 3000),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 7. Junior Backend Developer (Node.js & PostgreSQL)
    (
      '11111111-2222-4333-8444-000000000007'::uuid,
      v_tenant_id,
      v_dept_engineering,
      v_created_by,
      'Junior Backend Developer (Node.js & PostgreSQL)',
      'Kickstart or accelerate your engineering career with our core backend team in Cebu City. You will work alongside senior engineers to build TypeScript server actions, PostgreSQL functions, PDF document generators, and automated notification triggers.',
      E'• Bachelor''s degree in Computer Science, Information Technology, Computer Engineering, or equivalent practical experience\n• 1–2 years of experience (or strong capstone/internship track record) with Node.js, TypeScript, and SQL\n• Solid grasp of relational database fundamentals (joins, indexes, transactions, constraints) in PostgreSQL\n• Familiarity with Git, RESTful APIs, JSON schema validation (Zod), and automated unit testing\n• Eagerness to learn clean architecture and Philippine HR/payroll domain logic',
      E'• Implement and test backend API routes, Server Actions, and database query helpers in TypeScript\n• Write clean, well-documented SQL migrations and assist with schema validation\n• Build PDF generation templates for payslips, certificates, and employment contracts\n• Participate in daily standups, code reviews, and sprint planning',
      'Cebu City, Cebu',
      false,
      'onsite'::public.work_setup,
      v_city_cebu,
      v_prov_cebu,
      'full_time'::public.employment_type,
      35000.00,
      50000.00,
      'PHP',
      3,
      true,
      now() - interval '1 day',
      now() + interval '60 days',
      'it',
      'Backend Developer',
      ARRAY['Node.js', 'TypeScript', 'PostgreSQL', 'SQL', 'REST APIs', 'Git', 'Supabase', 'Zod'],
      1,
      'fixed',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Engineering',
        'phEmploymentStatus', 'probationary',
        'phProbationPeriodDays', 180,
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Meal Allowance (₱1,500/mo)',
          'Transportation / Fuel Allowance (₱1,000/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 1000),
          'internet_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'meal_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', true, 'amount', 1500),
          'performance_bonus', jsonb_build_object('enabled', false, 'amount', 0),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 8. Digital Marketing & Growth Specialist
    (
      '11111111-2222-4333-8444-000000000008'::uuid,
      v_tenant_id,
      v_dept_marketing,
      v_created_by,
      'Digital Marketing & Growth Specialist',
      'We are looking for a data-driven Digital Marketing & Growth Specialist in Taguig City (BGC), Metro Manila (WFH setup) to scale our B2B demand generation and employer brand across the Philippines. You will own SEO, LinkedIn and Meta performance campaigns, content marketing, and conversion rate optimization.',
      E'• 2–4 years of B2B/SaaS digital marketing, growth marketing, or demand generation experience in the Philippines\n• Hands-on expertise running and optimizing paid campaigns on LinkedIn Ads, Meta Ads Manager, and Google Ads\n• Strong SEO and content strategy skills (keyword research, landing page copywriting, case studies, email nurture flows)\n• Proficiency with Google Analytics 4 (GA4), Search Console, CRM/marketing automation, and Canva/Figma\n• Track record of generating qualified B2B leads and measuring CAC/funnel conversion metrics',
      E'• Plan, launch, and optimize multi-channel digital campaigns targeting Philippine SMEs and enterprise HR leaders\n• Produce high-converting thought leadership content, Philippine labor compliance guides, and customer success stories\n• Manage SEO health, public job board discoverability, and landing page conversion experiments\n• Collaborate with sales and product teams to align messaging and track pipeline attribution',
      'Taguig City (BGC), Metro Manila',
      false,
      'wfh'::public.work_setup,
      v_city_taguig,
      v_prov_ncr,
      'full_time'::public.employment_type,
      42000.00,
      60000.00,
      'PHP',
      1,
      true,
      now() - interval '3 days',
      now() + interval '45 days',
      'marketing',
      'Digital Marketing Specialist',
      ARRAY['Digital Marketing', 'SEO', 'LinkedIn Ads', 'Google Analytics 4', 'Content Strategy', 'B2B Growth', 'Copywriting', 'Lead Generation'],
      2,
      'flexible',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Marketing',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Medicard HMO (Day 1)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,000/mo)',
          'Communication / Internet Allowance (₱2,000/mo)',
          'Performance / KPI Bonus (₱3,500/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'transport_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 3500),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 9. Accounting & Tax Compliance Officer (CPA)
    (
      '11111111-2222-4333-8444-000000000009'::uuid,
      v_tenant_id,
      v_dept_finance,
      v_created_by,
      'Accounting & Tax Compliance Officer (CPA)',
      'We are seeking a licensed Certified Public Accountant (CPA) in Mandaue City, Cebu to oversee general ledger operations, Philippine BIR tax compliance, payroll journal reconciliation, and monthly financial reporting.',
      E'• Bachelor''s degree in Accountancy; active PRC Certified Public Accountant (CPA) license required\n• 3+ years of progressive experience in corporate accounting, tax compliance, or external audit in the Philippines\n• In-depth knowledge of PFRS, BIR tax regulations (EWT, VAT, 1601-C, 1601-EQ, 2550Q, 1702, Alphalist), and LGU business permit renewals\n• Experience reconciling payroll registers, statutory payables, and SaaS subscription revenue\n• Advanced Excel skills and experience with cloud accounting software (Xero, QuickBooks, or ERP systems)',
      E'• Manage full-cycle monthly, quarterly, and annual financial close and PFRS-compliant financial statements\n• Prepare and file accurate BIR tax returns, withholding tax certificates (2307/2316), and SEC/LGU statutory reports\n• Reconcile semi-monthly payroll disbursements, SSS/PhilHealth/Pag-IBIG remittances, and bank statements\n• Coordinate with external auditors and advise management on internal controls and tax optimization',
      'Mandaue City, Cebu',
      false,
      'onsite'::public.work_setup,
      v_city_mandaue,
      v_prov_cebu,
      'full_time'::public.employment_type,
      48000.00,
      68000.00,
      'PHP',
      1,
      true,
      now() - interval '4 days',
      now() + interval '45 days',
      'finance',
      'Accountant',
      ARRAY['CPA', 'BIR Tax Compliance', 'Financial Reporting', 'PFRS', 'General Ledger', 'Payroll Reconciliation', 'Xero / QuickBooks', 'Audit'],
      3,
      'fixed',
      'fixed',
      '08:30'::time,
      '17:30'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Finance',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1 + 1 Dependent)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1)',
          'Rice Subsidy (₱2,500/mo)',
          'Transportation / Fuel Allowance (₱1,500/mo)',
          'Meal Allowance (₱1,500/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2500),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'internet_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'meal_allowance', jsonb_build_object('enabled', true, 'amount', 1500),
          'clothing_allowance', jsonb_build_object('enabled', true, 'amount', 1000),
          'attendance_incentive', jsonb_build_object('enabled', true, 'amount', 2000),
          'performance_bonus', jsonb_build_object('enabled', false, 'amount', 0),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', '[]'::jsonb
        )
      )
    ),

    -- 10. AI & Data Pipeline Engineer
    (
      '11111111-2222-4333-8444-000000000010'::uuid,
      v_tenant_id,
      v_dept_data_ai,
      v_created_by,
      'AI & Data Pipeline Engineer',
      'Join our Data & AI team in Cebu City (Hybrid setup) to build the intelligence layer powering Kayod''s AI Resume Builder, semantic candidate-job matching, and workforce analytics. You will design LLM orchestration pipelines, structured extraction schemas, and low-latency scoring services.',
      E'• 4+ years of software or data engineering experience with 2+ years building production LLM / AI applications\n• Strong proficiency in TypeScript and Python, structured LLM outputs (Gemini, OpenAI, OpenRouter), and prompt engineering\n• Experience with PostgreSQL/pgvector, document parsing (PDF/DOCX text extraction), and ETL data pipelines\n• Solid understanding of evaluation frameworks, token/cost optimization, rate limiting, and fallback resilience\n• Awareness of data privacy and ethical AI practices under the Philippine Data Privacy Act (RA 10173)',
      E'• Design and optimize AI resume generation, tailoring, and weighted candidate-to-job match scoring pipelines\n• Build resilient document ingestion and structured JSON extraction services for uploaded PDF resumes\n• Benchmark LLM latency, accuracy, and cost across model providers with automated eval suites\n• Partner with product and backend teams to surface actionable workforce analytics for HR decision-makers',
      'Cebu City, Cebu',
      false,
      'hybrid'::public.work_setup,
      v_city_cebu,
      v_prov_cebu,
      'full_time'::public.employment_type,
      100000.00,
      145000.00,
      'PHP',
      2,
      true,
      now() - interval '1 day',
      now() + interval '60 days',
      'it',
      'Data Engineer',
      ARRAY['TypeScript', 'Python', 'LLM Orchestration', 'Gemini API', 'PostgreSQL', 'pgvector', 'Data Pipelines', 'RAG & Embeddings'],
      4,
      'flexible',
      'fixed',
      '09:00'::time,
      '18:00'::time,
      ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'],
      jsonb_build_object(
        'phDepartment', 'Data & AI',
        'phEmploymentStatus', 'regular',
        'phPayFrequency', 'semi_monthly',
        'phMandatory13thMonth', true,
        'phSssEnrolled', true,
        'phPhilhealthEnrolled', true,
        'phPagibigEnrolled', true,
        'phHmoProvider', 'Maxicare HMO (Day 1 + 2 Dependents)',
        'selectedBenefits', jsonb_build_array(
          '13th-Month Pay (PD 851)',
          'SSS, PhilHealth & Pag-IBIG Employer Share',
          'HMO / Medical Coverage (Day 1 + 2 Dependents)',
          'Rice Subsidy (₱2,500/mo)',
          'Communication / Internet Allowance (₱3,000/mo)',
          'Performance / KPI Bonus (₱6,000/mo)'
        ),
        'compensation_package', jsonb_build_object(
          'rice_allowance', jsonb_build_object('enabled', true, 'amount', 2500),
          'transport_allowance', jsonb_build_object('enabled', true, 'amount', 2000),
          'internet_allowance', jsonb_build_object('enabled', true, 'amount', 3000),
          'meal_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'clothing_allowance', jsonb_build_object('enabled', false, 'amount', 0),
          'attendance_incentive', jsonb_build_object('enabled', false, 'amount', 0),
          'performance_bonus', jsonb_build_object('enabled', true, 'amount', 6000),
          'thirteenth_month_pay', true,
          'hmo_coverage', jsonb_build_object('enabled', true, 'timing', 'day_1'),
          'custom_items', jsonb_build_array(
            jsonb_build_object('id', 'ai-compute-stipend', 'label', 'AI Research & Compute Stipend', 'amount', 3500, 'kind', 'allowance', 'enabled', true)
          )
        )
      )
    )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id             = EXCLUDED.tenant_id,
    department_id         = EXCLUDED.department_id,
    created_by            = EXCLUDED.created_by,
    title                 = EXCLUDED.title,
    description           = EXCLUDED.description,
    requirements          = EXCLUDED.requirements,
    responsibilities      = EXCLUDED.responsibilities,
    location              = EXCLUDED.location,
    is_remote             = EXCLUDED.is_remote,
    work_setup            = EXCLUDED.work_setup,
    city_id               = EXCLUDED.city_id,
    province_id           = EXCLUDED.province_id,
    employment_type       = EXCLUDED.employment_type,
    salary_min            = EXCLUDED.salary_min,
    salary_max            = EXCLUDED.salary_max,
    currency              = EXCLUDED.currency,
    slots                 = EXCLUDED.slots,
    is_published          = EXCLUDED.is_published,
    published_at          = EXCLUDED.published_at,
    closes_at             = EXCLUDED.closes_at,
    industry              = EXCLUDED.industry,
    job_category          = EXCLUDED.job_category,
    required_skills       = EXCLUDED.required_skills,
    min_experience        = EXCLUDED.min_experience,
    schedule_type         = EXCLUDED.schedule_type,
    rest_days_type        = EXCLUDED.rest_days_type,
    shift_start           = EXCLUDED.shift_start,
    shift_end             = EXCLUDED.shift_end,
    work_days             = EXCLUDED.work_days,
    offer_letter_settings = EXCLUDED.offer_letter_settings,
    updated_at            = now();

  -- 7. Seed default pre-employment document requirements for each seeded job if table exists
  IF to_regclass('public.job_required_documents') IS NOT NULL THEN
    INSERT INTO public.job_required_documents (job_posting_id, name, is_required)
    SELECT jp.id, doc.name, doc.is_required
    FROM (
      VALUES
        ('11111111-2222-4333-8444-000000000001'::uuid),
        ('11111111-2222-4333-8444-000000000002'::uuid),
        ('11111111-2222-4333-8444-000000000003'::uuid),
        ('11111111-2222-4333-8444-000000000004'::uuid),
        ('11111111-2222-4333-8444-000000000005'::uuid),
        ('11111111-2222-4333-8444-000000000006'::uuid),
        ('11111111-2222-4333-8444-000000000007'::uuid),
        ('11111111-2222-4333-8444-000000000008'::uuid),
        ('11111111-2222-4333-8444-000000000009'::uuid),
        ('11111111-2222-4333-8444-000000000010'::uuid)
    ) AS jp(id)
    CROSS JOIN (
      VALUES
        ('Valid Government-Issued ID', true),
        ('NBI Clearance', true),
        ('BIR Form 2316 / 1902 (TIN)', true),
        ('SSS E-1 / Static Information', true),
        ('PhilHealth MDR', true),
        ('Pag-IBIG MDF', true),
        ('Pre-Employment Medical Exam (PEME)', true)
    ) AS doc(name, is_required)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.job_required_documents existing
      WHERE existing.job_posting_id = jp.id
        AND existing.name = doc.name
    );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

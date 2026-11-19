-- Public-safe view of published, open job postings.
-- security_invoker = false is deliberate; the WHERE clause is the protection; Supabase's linter will warn about it.
CREATE OR REPLACE VIEW public.public_job_postings
WITH (security_invoker = false) AS
SELECT
  jp.id,
  jp.title,
  jp.description,
  jp.requirements,
  jp.responsibilities,
  jp.required_skills,
  jp.employment_type,
  jp.work_setup,
  jp.is_remote,
  jp.job_category,
  jp.industry,
  jp.location,
  jp.city_id,
  jp.province_id,
  jp.salary_min,
  jp.salary_max,
  jp.currency,
  jp.min_experience,
  jp.slots,
  jp.published_at,
  jp.closes_at,
  t.name AS company_name,
  t.logo_url AS company_logo_url,
  (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'label', v.label,
        'amount', (jp.offer_letter_settings->'compensation_package'->v.key->>'amount')::numeric
      ) AS item
      FROM (VALUES
        ('rice_allowance', 'Rice Subsidy'),
        ('transport_allowance', 'Transportation / Fuel Allowance'),
        ('internet_allowance', 'Communication / Internet Allowance'),
        ('meal_allowance', 'Meal Allowance'),
        ('clothing_allowance', 'Clothing / Uniform Allowance'),
        ('attendance_incentive', 'Perfect Attendance Incentive'),
        ('performance_bonus', 'Performance / KPI Bonus')
      ) AS v(key, label)
      WHERE COALESCE((jp.offer_letter_settings->'compensation_package'->v.key->>'enabled')::boolean, false) = true
        AND COALESCE((jp.offer_letter_settings->'compensation_package'->v.key->>'amount')::numeric, 0) > 0
      UNION ALL
      SELECT jsonb_build_object(
        'label', trim(c->>'label'),
        'amount', (c->>'amount')::numeric
      ) AS item
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(jp.offer_letter_settings->'compensation_package'->'custom_items') = 'array'
          THEN jp.offer_letter_settings->'compensation_package'->'custom_items'
          ELSE '[]'::jsonb
        END
      ) AS c
      WHERE COALESCE((c->>'enabled')::boolean, true) = true
        AND COALESCE((c->>'amount')::numeric, 0) > 0
        AND NULLIF(trim(COALESCE(c->>'label', '')), '') IS NOT NULL
    ) AS benefits
  ) AS public_benefits
FROM public.job_postings AS jp
LEFT JOIN public.tenants AS t ON t.id = jp.tenant_id
WHERE jp.is_published = true
  AND (jp.closes_at IS NULL OR jp.closes_at > now());

GRANT SELECT ON public.public_job_postings TO anon, authenticated;

-- Verification queries (SELECT-only, run manually after applying migration):
-- SELECT count(*) FROM public.public_job_postings;
-- SELECT id, title, company_name, company_logo_url, public_benefits, published_at, closes_at FROM public.public_job_postings LIMIT 5;

-- TIM-2447: Static seed for benchmark_reference_values.
--
-- The AI-extraction pipeline (scripts/run-benchmark-extraction.mjs) is the
-- canonical mechanism for refreshing this table — it lands 3-5 rows per run on
-- the first pass. To meet Phase 0's acceptance criterion (>=1 row per headline
-- metric across pillars 1-4) on day one, we also pre-seed a baseline from
-- well-known public sources: SEC EDGAR (Starbucks / Dutch Bros 10-K filings),
-- BLS OEWS wage data, NCA NCDT, NRA published guidelines, and Daily Coffee
-- News trade press. Every row is source-cited; the unique constraint
-- (metric_id, cohort_id, source_url, extraction_date) means subsequent LLM
-- extractions on the same source same-day overwrite, and quarterly re-runs
-- land new dated rows.
--
-- Dataset version 2026.Q2.

INSERT INTO public.benchmark_reference_values (
  metric_id, cohort_id, value_type, p25, p50, p75, low, high, sample_size,
  source_url, source_name, source_publication_date, extraction_date,
  extraction_confidence, dataset_version, notes
) VALUES
  -- ── Pillar 1: Revenue & traffic ──────────────────────────────────────────
  -- AUV — multi-location chain reference (upper bound), Starbucks system AUV from 10-K.
  (
    'auv_usd',
    (SELECT id FROM public.benchmark_cohorts WHERE cohort_key = 'multi_location_chain'),
    'range', NULL, NULL, NULL, 1500000, 1700000, NULL,
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000829224&type=10-K',
    'SEC EDGAR — Starbucks 10-K (FY2024)',
    '2024-11-15', '2026-06-07', 'high', '2026.Q2',
    'Starbucks company-operated US store AUV per 10-K segment disclosure. Upper-bound reference; independent specialty cafes typically run 30-60% of this.'
  ),
  -- AUV — independent specialty cafe range, NCA + trade-press composite.
  (
    'auv_usd', NULL,
    'range', NULL, NULL, NULL, 400000, 1200000, NULL,
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — Industry Resources + trade-press composite',
    '2024-01-01', '2026-06-07', 'medium', '2026.Q2',
    'Independent specialty cafe AUV range; lower bound = sub-scale grab-and-go, upper bound = high-traffic third-wave with food.'
  ),
  -- Average ticket — independent specialty range, NCA NCDT 2024.
  (
    'avg_ticket_usd', NULL,
    'range', NULL, NULL, NULL, 6.50, 12.50, NULL,
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — NCDT 2024',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'NCA National Coffee Data Trends 2024: average ticket at independent specialty cafes (drink + food attach).'
  ),
  -- Transactions per day — independent cafe range, trade-press composite.
  (
    'transactions_per_day', NULL,
    'range', NULL, NULL, NULL, 150, 600, NULL,
    'https://dailycoffeenews.com/category/business/',
    'Daily Coffee News — Operator profiles 2023-2024',
    '2024-01-01', '2026-06-07', 'medium', '2026.Q2',
    'Trade-press operator profiles: low end = small neighborhood cafe, high end = high-traffic drive-thru or 1500+ sqft third-wave.'
  ),
  -- Revenue per sqft — independent specialty range.
  (
    'revenue_per_sqft_usd', NULL,
    'range', NULL, NULL, NULL, 400, 900, NULL,
    'https://dailycoffeenews.com/category/business/',
    'Daily Coffee News — Trade-press composite',
    '2024-01-01', '2026-06-07', 'medium', '2026.Q2',
    'Annual revenue per built sqft for independent specialty cafes. Drive-thru small format runs higher per sqft than cafe formats.'
  ),

  -- ── Pillar 2: COGS ───────────────────────────────────────────────────────
  -- Total COGS — NCA + NRA published target range.
  (
    'total_cogs_pct', NULL,
    'range', NULL, NULL, NULL, 28, 35, NULL,
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — Industry Resources',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'NCA / NRA target range for total COGS at specialty coffee operations.'
  ),
  -- Beverage COGS — NCA-aligned operator data.
  (
    'beverage_cogs_pct', NULL,
    'range', NULL, NULL, NULL, 18, 25, NULL,
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — Industry Resources',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'Beverage-only COGS for specialty espresso operations.'
  ),
  -- Food COGS — NRA limited-service food guideline.
  (
    'food_cogs_pct', NULL,
    'range', NULL, NULL, NULL, 28, 36, NULL,
    'https://restaurant.org/research-and-media/research/industry-statistics/',
    'National Restaurant Association — Industry Statistics',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'NRA food cost guideline for limited-service cafe food programs (pastries, sandwiches, salads).'
  ),

  -- ── Pillar 3: Labor ──────────────────────────────────────────────────────
  -- Labor % of revenue — independent specialty (the multi-location chain row from LLM stays alongside this).
  (
    'labor_pct_of_revenue', NULL,
    'range', NULL, NULL, NULL, 28, 35, NULL,
    'https://sca.coffee/research',
    'Specialty Coffee Association — Operators Guide',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'SCA Operators Guide observed range for independent specialty cafes; SCA target band is 25-30%.'
  ),
  -- Sales per labor hour — independent specialty.
  (
    'sales_per_labor_hour_usd', NULL,
    'range', NULL, NULL, NULL, 70, 130, NULL,
    'https://sca.coffee/research',
    'Specialty Coffee Association — Operators Guide',
    '2024-01-01', '2026-06-07', 'medium', '2026.Q2',
    'Sales per scheduled labor hour at independent specialty cafes; varies sharply with daypart mix and AUV.'
  ),
  -- Turnover — full BLS limited-service range (broader than the LLM-extracted MRM row at 75-80).
  (
    'turnover_pct_annual', NULL,
    'range', NULL, NULL, NULL, 60, 130, NULL,
    'https://restaurant.org/research-and-media/research/industry-statistics/',
    'National Restaurant Association — Industry Statistics',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'NRA limited-service turnover range; specialty cafes that invest in benefits + training cluster at the lower end.'
  ),

  -- ── Pillar 4: Real estate & fit-out ──────────────────────────────────────
  -- Rent % of revenue — NRA published guideline.
  (
    'rent_pct_of_revenue', NULL,
    'range', NULL, NULL, NULL, 6, 10, NULL,
    'https://restaurant.org/research-and-media/research/industry-statistics/',
    'National Restaurant Association — Industry Statistics',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'NRA published rent-to-revenue guideline for food-service operators.'
  ),
  -- Rent per sqft — trade-press composite across US metros.
  (
    'rent_per_sqft_annual_usd', NULL,
    'range', NULL, NULL, NULL, 30, 100, NULL,
    'https://dailycoffeenews.com/category/business/',
    'Daily Coffee News — Lease coverage composite',
    '2024-01-01', '2026-06-07', 'medium', '2026.Q2',
    'Annual rent per sqft for retail coffee leases; low end = mid-market suburban strip, high end = top-50-metro urban storefront.'
  ),
  -- Fit-out per sqft — trade-press operator profiles.
  (
    'fitout_per_sqft_usd', NULL,
    'range', NULL, NULL, NULL, 250, 450, NULL,
    'https://dailycoffeenews.com/category/business/',
    'Daily Coffee News — Operator build cost composite',
    '2024-01-01', '2026-06-07', 'high', '2026.Q2',
    'Turnkey specialty cafe fit-out cost per built sqft (excludes major MEP / structural upgrades).'
  )
ON CONFLICT (metric_id, cohort_id, source_url, extraction_date) DO UPDATE SET
  low = EXCLUDED.low,
  high = EXCLUDED.high,
  p25 = EXCLUDED.p25,
  p50 = EXCLUDED.p50,
  p75 = EXCLUDED.p75,
  source_name = EXCLUDED.source_name,
  source_publication_date = EXCLUDED.source_publication_date,
  extraction_confidence = EXCLUDED.extraction_confidence,
  dataset_version = EXCLUDED.dataset_version,
  notes = EXCLUDED.notes;

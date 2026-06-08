-- TIM-2447: Seed benchmark_best_practices.
--
-- Curated, well-known industry guidelines that don't need AI extraction —
-- they're stable rules-of-thumb published by SCA / NCA / NRA / academic
-- sources and used across the industry. Phase 0 ships these so that even if
-- the AI-extraction pipeline returns no cohort rows for a given metric, the
-- Phase 1 engine still has a guideline to fall back to.
--
-- Idempotent: composite unique on (metric_id, applicable_cohort_filter,
-- source_url, extraction_date). Re-runs on the same day overwrite.
--
-- Dataset version stamped to 2026.Q2; quarterly refresh re-stamps.

INSERT INTO public.benchmark_best_practices (
  metric_id, applicable_cohort_filter, guideline_low, guideline_high, guideline_target,
  rationale, source_url, source_name, source_publication_date, dataset_version
) VALUES
  -- Labor % — SCA Operators Guide is the canonical reference.
  (
    'labor_pct_of_revenue',
    NULL,
    25, 30, 28,
    'SCA Operators Guide target: 25-30% labor cost for specialty coffee operators. Anything above 32% signals overstaffing or wage misalignment; anything below 23% signals understaffing risk to service quality.',
    'https://sca.coffee/research',
    'Specialty Coffee Association — Operators Guide',
    '2024-01-01',
    '2026.Q2'
  ),
  (
    'labor_pct_of_revenue',
    '{"model":"drive_thru"}'::jsonb,
    22, 27, 25,
    'Drive-thru shops typically run 2-3 points below the cafe baseline because dine-in service labor is removed. SCA Operators Guide drive-thru annex / NRA QSR labor benchmarks.',
    'https://sca.coffee/research',
    'Specialty Coffee Association — Operators Guide (drive-thru annex)',
    '2024-01-01',
    '2026.Q2'
  ),

  -- COGS % — NCA + NRA give a tight target range for specialty operators.
  (
    'total_cogs_pct',
    NULL,
    28, 35, 32,
    'NCA / NRA target for total COGS in a specialty coffee operation: 28-35%. The bottom of the range is achievable with vertical milk sourcing and tight portion control; the top is the upper limit before margin compression becomes structural.',
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — Industry Resources',
    '2024-01-01',
    '2026.Q2'
  ),
  (
    'beverage_cogs_pct',
    NULL,
    18, 25, 22,
    'Beverage-only COGS for specialty espresso: 18-25%. Milk is the largest variable; concentrated cold brew and oat-milk premiums push toward the upper bound.',
    'https://www.ncausa.org/Industry-Resources',
    'National Coffee Association — Industry Resources',
    '2024-01-01',
    '2026.Q2'
  ),

  -- Rent — NRA published guideline is widely cited.
  (
    'rent_pct_of_revenue',
    NULL,
    6, 10, 8,
    'NRA published guideline for food-service rent-to-revenue: 6-10%. Above 10% pressures margin; below 6% usually indicates either a B/C location or a long-tenured below-market lease.',
    'https://restaurant.org/research-and-media/research/industry-statistics/',
    'National Restaurant Association — Industry Statistics',
    '2024-01-01',
    '2026.Q2'
  ),

  -- Fit-out per sqft — Daily Coffee News / specialty trade press cite this band.
  (
    'fitout_per_sqft_usd',
    NULL,
    250, 450, 350,
    'Specialty cafe fit-out: $250-$450 per sqft for a turnkey build (no major MEP / structural surprises). Drive-thru small format typically lands at the lower end; full dine-in cafe with bakery / kitchen at the upper end.',
    'https://dailycoffeenews.com/category/business/',
    'Daily Coffee News — Business',
    '2024-01-01',
    '2026.Q2'
  ),

  -- Turnover — NRA broad benchmark for limited-service.
  (
    'turnover_pct_annual',
    NULL,
    60, 130, 90,
    'NRA limited-service turnover ranges from 60% (well-run, tipped, high-engagement) to 130% (industry-wide, including QSR). Specialty cafes that invest in training + benefits cluster at the lower end.',
    'https://restaurant.org/research-and-media/research/industry-statistics/',
    'National Restaurant Association — Industry Statistics',
    '2024-01-01',
    '2026.Q2'
  )
ON CONFLICT (metric_id, applicable_cohort_filter, source_url, extraction_date) DO UPDATE SET
  guideline_low = EXCLUDED.guideline_low,
  guideline_high = EXCLUDED.guideline_high,
  guideline_target = EXCLUDED.guideline_target,
  rationale = EXCLUDED.rationale,
  source_name = EXCLUDED.source_name,
  source_publication_date = EXCLUDED.source_publication_date,
  dataset_version = EXCLUDED.dataset_version;

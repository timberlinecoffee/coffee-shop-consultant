-- TIM-2447: Seed benchmark_cohorts.
--
-- Starter cohort set covering the most common slices a Groundwork user will
-- fall into. The Phase 1 cohort matcher (separate issue) does nearest-neighbor
-- on (model + sqft_bucket + auv_tier + geo_tier); these cover the high-signal
-- combinations. Extra cohorts can be added later without a migration — this
-- seed is idempotent on cohort_key.
--
-- axes shape: { model, sqft_bucket, geo_tier, age_bucket, auv_tier, concept }
--   model        ∈ {drive_thru, cafe, kiosk, cafe_drive_thru, multi_location, mobile_cart}
--   sqft_bucket  ∈ {lt_500, 500_1500, 1500_3000, gt_3000}
--   geo_tier     ∈ {top_50_metro, mid_metro, small_metro, rural}
--   age_bucket   ∈ {pre_open, lt_1y, 1_3y, 3_7y, mature_7plus}
--   auv_tier     ∈ {low, mid, high, top_decile}
--   concept      ∈ {third_wave_specialty, neighborhood_cafe, grab_and_go, cafe_food_program, roastery_cafe}

INSERT INTO public.benchmark_cohorts (cohort_key, axes, description) VALUES
  (
    'drive_thru_500_1500_top50_1_3y',
    '{"model":"drive_thru","sqft_bucket":"500_1500","geo_tier":"top_50_metro","age_bucket":"1_3y"}'::jsonb,
    'Drive-thru, 500-1500 sqft, top-50 metro, 1-3 years old.'
  ),
  (
    'cafe_500_1500_top50_1_3y',
    '{"model":"cafe","sqft_bucket":"500_1500","geo_tier":"top_50_metro","age_bucket":"1_3y"}'::jsonb,
    'Dine-in cafe, 500-1500 sqft, top-50 metro, 1-3 years old.'
  ),
  (
    'cafe_third_wave_neighborhood',
    '{"model":"cafe","concept":"third_wave_specialty"}'::jsonb,
    'Third-wave specialty cafe, neighborhood (model and concept only — broad).'
  ),
  (
    'kiosk_small',
    '{"model":"kiosk","sqft_bucket":"lt_500"}'::jsonb,
    'Kiosk under 500 sqft, any region.'
  ),
  (
    'cafe_food_program_1500_3000',
    '{"model":"cafe","sqft_bucket":"1500_3000","concept":"cafe_food_program"}'::jsonb,
    'Cafe with food program, 1500-3000 sqft.'
  ),
  (
    'multi_location_chain',
    '{"model":"multi_location"}'::jsonb,
    'Multi-location operators (3+ shops); upper-bound reference cohort from SEC filings.'
  )
ON CONFLICT (cohort_key) DO UPDATE SET
  axes = EXCLUDED.axes,
  description = EXCLUDED.description;

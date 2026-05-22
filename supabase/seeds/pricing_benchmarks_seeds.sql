-- pricing_benchmarks reference seed — Pacific Northwest / Seattle region
-- W4 Menu & Pricing workspace — AI benchmark anchors (TIM-703 / TIM-863)
--
-- Sources:
--   Square "Coffee Shop Sales Data" 2025-2026 (squareup.com/us/en/townsquare/coffee-shop-pos)
--   Specialty Coffee Association Price Index Q4 2025 (sca.coffee)
--   Seattle Business Magazine "What Does Coffee Cost?" Jan 2026 (seattlebusinessmag.com)
--   Portland Monthly "Best Coffee Shops" pricing survey 2025 (portlandmonthly.com)
--   Internal Timberline Coffee School market survey, PNW operators, Dec 2025
--
-- region_key values: 'pnw' covers Portland, Seattle, and broader Pacific Northwest.
-- All prices in US cents.  p25/p50/p75 = 25th / 50th / 75th percentile retail price.
--
-- Idempotent: ON CONFLICT (region_key, category, item_name_canonical) DO NOTHING
-- Safe to re-run.

INSERT INTO public.pricing_benchmarks
  (id, region_key, category, item_name_canonical,
   price_cents_p25, price_cents_p50, price_cents_p75,
   source, collected_on)
VALUES

-- ── Espresso ───────────────────────────────────────────────────────────────────
(
  'bb000001-0000-0000-0000-000000000001',
  'pnw', 'espresso', 'Espresso (solo/doppio)',
  325, 375, 425,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000002',
  'pnw', 'espresso', 'Americano (12 oz)',
  375, 425, 500,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000003',
  'pnw', 'espresso', 'Cappuccino (6–8 oz)',
  475, 525, 600,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000004',
  'pnw', 'espresso', 'Cortado (4 oz)',
  450, 500, 575,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),

-- ── Drip / Batch Brew ─────────────────────────────────────────────────────────
(
  'bb000001-0000-0000-0000-000000000010',
  'pnw', 'drip', 'Drip Coffee (12 oz)',
  325, 400, 475,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000011',
  'pnw', 'drip', 'Drip Coffee (16 oz)',
  375, 450, 525,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000012',
  'pnw', 'drip', 'Pour-over Single Cup',
  550, 625, 750,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000013',
  'pnw', 'drip', 'Cold Brew (12 oz)',
  475, 550, 650,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),

-- ── Latte / Milk-based ────────────────────────────────────────────────────────
(
  'bb000001-0000-0000-0000-000000000020',
  'pnw', 'latte', 'Latte (12 oz)',
  500, 575, 650,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000021',
  'pnw', 'latte', 'Latte (16 oz)',
  575, 650, 725,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000022',
  'pnw', 'latte', 'Flat White (6–8 oz)',
  525, 600, 675,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000023',
  'pnw', 'latte', 'Oat Milk Latte (12 oz)',
  575, 650, 750,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000024',
  'pnw', 'latte', 'Matcha Latte (12 oz)',
  575, 650, 750,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),

-- ── Specialty ─────────────────────────────────────────────────────────────────
(
  'bb000001-0000-0000-0000-000000000030',
  'pnw', 'specialty', 'Seasonal Signature Latte (12 oz)',
  600, 700, 800,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000031',
  'pnw', 'specialty', 'Lavender / Syrup Latte (12 oz)',
  625, 725, 825,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000032',
  'pnw', 'specialty', 'Blended Drink (16 oz)',
  650, 750, 875,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
),
(
  'bb000001-0000-0000-0000-000000000033',
  'pnw', 'specialty', 'Chai Latte (12 oz)',
  550, 625, 725,
  'SCA Price Index + PNW operator survey Dec 2025', '2025-12-01'
)

ON CONFLICT (region_key, category, item_name_canonical) DO NOTHING;

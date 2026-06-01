-- TIM-1692: Cross-user pricing benchmark — anonymized aggregation plumbing.
-- Stores one row per benchmark call (item price at time of benchmark).
-- NO PII: no user_id, no plan_id, no item_id. Linked only via normalized
-- item name + optional region hint.
-- Privacy design: data is aggregated at query time; individual rows are
-- never exposed to other users. Opt-in flag lives on coffee_shop_plans.
-- Threshold for switching from AI estimate to real percentiles: 20 data
-- points per (item_name_normalized, region_bucket) tuple.

-- 1. Opt-in flag on plans (defaults true for v1; Legal/Security can flip
--    default or add explicit consent flow post-v1).
alter table public.coffee_shop_plans
  add column if not exists aggregate_opt_in boolean not null default true;

comment on column public.coffee_shop_plans.aggregate_opt_in is
  'When true, benchmark calls contribute anonymized price data to cross-user aggregate. No PII stored.';

-- 2. Aggregate table: one row per benchmark submission.
create table if not exists public.menu_price_aggregates (
  id             uuid primary key default gen_random_uuid(),
  -- Normalized item name: trimmed, lowercased, so "Oat Milk Latte" and
  -- "oat milk latte" group together. Intentionally lossy.
  item_name_normalized  text        not null check (length(item_name_normalized) between 1 and 200),
  -- Broad category bucket derived from the item name (espresso, drip, food…).
  -- Populated by the API; NULL is acceptable if categorization fails.
  item_category         text,
  -- Price in cents at the time of the benchmark call.
  price_cents           integer     not null check (price_cents > 0),
  -- Coarse region bucket derived from the concept_context location string.
  -- e.g. "Seattle, WA" → "Pacific Northwest". NULL if no location given.
  region_bucket         text,
  created_at            timestamptz not null default now()
);

comment on table public.menu_price_aggregates is
  'Anonymized menu item prices captured at benchmark time. Used to build cross-user price percentiles once per-name volume exceeds 20 rows. No PII.';

-- Indexing for the percentile read path: group by name + region.
create index if not exists menu_price_aggregates_name_region_idx
  on public.menu_price_aggregates (item_name_normalized, region_bucket);

create index if not exists menu_price_aggregates_created_at_idx
  on public.menu_price_aggregates (created_at);

-- 3. Helper view: per-name-region percentile stats (only where n >= 20).
-- Threshold is encoded here — when changing the threshold, update this view
-- AND the API constant REAL_DATA_MIN_COUNT in platform-percentile/route.ts.
create or replace view public.menu_price_percentiles as
select
  item_name_normalized,
  region_bucket,
  count(*)                                         as data_point_count,
  percentile_cont(0.25) within group (order by price_cents)::integer as p25_cents,
  percentile_cont(0.50) within group (order by price_cents)::integer as p50_cents,
  percentile_cont(0.75) within group (order by price_cents)::integer as p75_cents,
  min(price_cents)                                 as min_cents,
  max(price_cents)                                 as max_cents,
  round(avg(price_cents))::integer                 as avg_cents
from public.menu_price_aggregates
group by item_name_normalized, region_bucket
having count(*) >= 20;

comment on view public.menu_price_percentiles is
  'Cross-user price percentiles per item/region. Only rows with >= 20 data points are surfaced. The 20-row threshold matches the REAL_DATA_MIN_COUNT constant in the platform-percentile API route.';

-- 4. RLS: aggregates are write-only for authenticated users (insert via
--    service-role in the API), never readable by end users.
alter table public.menu_price_aggregates enable row level security;

-- Service role (used by Next.js API routes) bypasses RLS.
-- No RLS policy needed for authenticated users because they should not
-- query this table directly; the percentile view is the read surface.
-- Block direct authenticated reads to prevent cross-user data leakage.
create policy "no_direct_read"
  on public.menu_price_aggregates
  for select
  to authenticated
  using (false);

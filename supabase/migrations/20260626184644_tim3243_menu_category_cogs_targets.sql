-- TIM-3243 (parent TIM-3239): category-specific COGS targets in menu workspace.
-- Adds per-category COGS range fields, a system reference table for the 5
-- seeded presets, and backfills existing user categories with a sensible
-- default (current plan-level COGS target, range = global..global+5).
--
-- Standing Engineering Rule 1: every new table ships with RLS enabled +
-- deny-by-default policies. menu_category_presets is system reference data
-- (readable by all authenticated users, writable by service role only).

------------------------------------------------------------------------------
-- 1. Per-category COGS target range + financial role
------------------------------------------------------------------------------

alter table public.menu_categories
  add column if not exists target_cogs_low_pct  numeric(5,2),
  add column if not exists target_cogs_high_pct numeric(5,2),
  add column if not exists financial_role       text;

alter table public.menu_categories
  drop constraint if exists menu_categories_target_cogs_low_range_chk;
alter table public.menu_categories
  add constraint menu_categories_target_cogs_low_range_chk
  check (target_cogs_low_pct  is null or (target_cogs_low_pct  >= 0 and target_cogs_low_pct  <= 100));

alter table public.menu_categories
  drop constraint if exists menu_categories_target_cogs_high_range_chk;
alter table public.menu_categories
  add constraint menu_categories_target_cogs_high_range_chk
  check (target_cogs_high_pct is null or (target_cogs_high_pct >= 0 and target_cogs_high_pct <= 100));

alter table public.menu_categories
  drop constraint if exists menu_categories_target_cogs_range_order_chk;
alter table public.menu_categories
  add constraint menu_categories_target_cogs_range_order_chk
  check (
    target_cogs_low_pct is null
    or target_cogs_high_pct is null
    or target_cogs_low_pct <= target_cogs_high_pct
  );

comment on column public.menu_categories.target_cogs_low_pct  is
  'TIM-3243: lower bound of target COGS % for this category. Null means inherit plan-level default.';
comment on column public.menu_categories.target_cogs_high_pct is
  'TIM-3243: upper bound of target COGS % for this category. Null means inherit plan-level default.';
comment on column public.menu_categories.financial_role is
  'TIM-3243: short label describing the category''s primary financial role (preset rows only).';

------------------------------------------------------------------------------
-- 2. System reference table — seeded preset categories
------------------------------------------------------------------------------

create table if not exists public.menu_category_presets (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  target_cogs_low_pct   numeric(5,2) not null check (target_cogs_low_pct  >= 0 and target_cogs_low_pct  <= 100),
  target_cogs_high_pct  numeric(5,2) not null check (target_cogs_high_pct >= 0 and target_cogs_high_pct <= 100),
  financial_role        text not null,
  position              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint menu_category_presets_range_order_chk
    check (target_cogs_low_pct <= target_cogs_high_pct)
);

create index if not exists menu_category_presets_position_idx
  on public.menu_category_presets(position);

alter table public.menu_category_presets enable row level security;

-- Deny-by-default: only an explicit SELECT policy for authenticated users.
-- Writes are reserved for the service role (bypasses RLS) — this is system
-- reference data; users never mutate it from the client.
drop policy if exists "Authenticated users can read menu category presets"
  on public.menu_category_presets;
create policy "Authenticated users can read menu category presets"
  on public.menu_category_presets for select
  to authenticated
  using (true);

drop trigger if exists handle_menu_category_presets_updated_at
  on public.menu_category_presets;
create trigger handle_menu_category_presets_updated_at
  before update on public.menu_category_presets
  for each row execute procedure public.handle_updated_at();

-- Seed the 5 system presets (idempotent on slug).
insert into public.menu_category_presets
  (slug, name, target_cogs_low_pct, target_cogs_high_pct, financial_role, position)
values
  ('beverages',
   'Beverages (Espresso/Tea)',
   15, 20,
   'Core revenue driver; offsets high labor & machinery overhead.',
   0),
  ('food_pastries',
   'Food (Pastries/Baked Goods)',
   20, 25,
   'Quick-turnover add-on; usually outsourced with minimal prep labor.',
   1),
  ('coffee_beans_retail',
   'Coffee Beans (Retail Bags)',
   30, 40,
   'Brand builder; higher wholesale inventory cost but zero prep labor.',
   2),
  ('large_food',
   'Large Food (Sandwiches/Salads)',
   30, 40,
   'Higher ticket sizes; highly perishable ingredients with high labor.',
   3),
  ('retail_items',
   'Retail Items (Merch/Mugs)',
   40, 50,
   'Slowest turning inventory; high cost but extends brand footprint.',
   4)
on conflict (slug) do nothing;

------------------------------------------------------------------------------
-- 3. Backfill existing menu_categories rows.
-- Rule: only fill where the field is currently NULL. Never overwrite an
-- existing user-defined custom range. Source for "current global COGS target":
-- financial_models.forecast_inputs->>cogs_pct (the plan's COGS % input).
-- Fallback 30 (matches defaultForecast() in src/lib/financials.ts).
------------------------------------------------------------------------------

with plan_cogs as (
  select
    p.id as plan_id,
    coalesce(
      nullif(fm.forecast_inputs->>'cogs_pct','')::numeric,
      30
    ) as cogs_pct
  from public.coffee_shop_plans p
  left join public.financial_models fm on fm.plan_id = p.id
)
update public.menu_categories mc
set
  target_cogs_low_pct  = case
    when mc.target_cogs_low_pct  is null
    then least(greatest(pc.cogs_pct, 0), 100)
    else mc.target_cogs_low_pct
  end,
  target_cogs_high_pct = case
    when mc.target_cogs_high_pct is null
    then least(greatest(pc.cogs_pct + 5, 0), 100)
    else mc.target_cogs_high_pct
  end
from plan_cogs pc
where mc.plan_id = pc.plan_id
  and (mc.target_cogs_low_pct is null or mc.target_cogs_high_pct is null);

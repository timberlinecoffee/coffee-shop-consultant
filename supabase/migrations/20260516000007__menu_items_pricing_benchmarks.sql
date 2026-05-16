-- TIM-703 / TIM-622-A: menu_items (new schema) + pricing_benchmarks + RLS
-- Replaces the placeholder menu_items table (wrong schema, 0 rows) with the
-- structured W4 menu & pricing model per TIM-622 plan §2.

-- ── Drop old menu_items ────────────────────────────────────────────────────────

drop table if exists public.menu_items cascade;

-- ── menu_items ─────────────────────────────────────────────────────────────────

create table public.menu_items (
  id                uuid         primary key default gen_random_uuid(),
  plan_id           uuid         not null references public.coffee_shop_plans(id) on delete cascade,
  position          int          not null default 0,
  name              text         not null,
  category          text         not null,
  price_cents       int          not null check (price_cents >= 0),
  cogs_cents        int          not null check (cogs_cents >= 0),
  expected_mix_pct  numeric(5,2) not null default 0,
  prep_time_seconds int,
  notes             text,
  archived          bool         not null default false,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

create index on public.menu_items (plan_id) where archived = false;

alter table public.menu_items enable row level security;

create policy "plan_owner_read_menu_items"
  on public.menu_items
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_menu_items"
  on public.menu_items
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create trigger handle_menu_items_updated_at
  before update on public.menu_items
  for each row execute procedure public.handle_updated_at();

-- ── pricing_benchmarks ─────────────────────────────────────────────────────────

create table public.pricing_benchmarks (
  id                  uuid  primary key default gen_random_uuid(),
  region_key          text  not null,
  category            text  not null,
  item_name_canonical text  not null,
  price_cents_p25     int   not null,
  price_cents_p50     int   not null,
  price_cents_p75     int   not null,
  source              text,
  collected_on        date  not null
);

create unique index on public.pricing_benchmarks (region_key, category, item_name_canonical);

alter table public.pricing_benchmarks enable row level security;

create policy "authenticated_read_pricing_benchmarks"
  on public.pricing_benchmarks
  for select
  to authenticated
  using (true);

create policy "service_role_write_pricing_benchmarks"
  on public.pricing_benchmarks
  for all
  to service_role
  using (true)
  with check (true);

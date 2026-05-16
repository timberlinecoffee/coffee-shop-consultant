-- TIM-703 / TIM-622-A: menu_items W4 schema + pricing_benchmarks reference table
-- Replaces the old menu_items placeholder (wrong schema) with the W4 CRUD-ready structure.

-- ── Drop old menu_items (placeholder, 0 rows) ─────────────────────────────────

drop table if exists public.menu_items cascade;

-- ── menu_items ────────────────────────────────────────────────────────────────

create table public.menu_items (
  id                 uuid          primary key default gen_random_uuid(),
  plan_id            uuid          not null references public.coffee_shop_plans(id) on delete cascade,
  position           int           not null default 0,
  name               text          not null,
  category           text          not null check (category in (
    'espresso', 'drip', 'specialty', 'food', 'retail', 'other'
  )),
  price_cents        int           not null default 0 check (price_cents >= 0),
  cogs_cents         int           not null default 0 check (cogs_cents >= 0),
  expected_mix_pct   numeric(5,2)  not null default 0,
  prep_time_seconds  int,
  notes              text,
  archived           bool          not null default false,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

create index on public.menu_items (plan_id) where archived = false;

alter table public.menu_items enable row level security;

-- Plan-owner read
create policy "plan_owner_read_menu_items"
  on public.menu_items
  for select
  using (
    exists (
      select 1
        from public.coffee_shop_plans p
       where p.id = menu_items.plan_id
         and p.user_id = auth.uid()
    )
  );

-- Plan-owner insert
create policy "plan_owner_insert_menu_items"
  on public.menu_items
  for insert
  with check (
    exists (
      select 1
        from public.coffee_shop_plans p
       where p.id = menu_items.plan_id
         and p.user_id = auth.uid()
    )
  );

-- Plan-owner update
create policy "plan_owner_update_menu_items"
  on public.menu_items
  for update
  using (
    exists (
      select 1
        from public.coffee_shop_plans p
       where p.id = menu_items.plan_id
         and p.user_id = auth.uid()
    )
  );

-- Plan-owner delete
create policy "plan_owner_delete_menu_items"
  on public.menu_items
  for delete
  using (
    exists (
      select 1
        from public.coffee_shop_plans p
       where p.id = menu_items.plan_id
         and p.user_id = auth.uid()
    )
  );

-- ── pricing_benchmarks ────────────────────────────────────────────────────────

create table public.pricing_benchmarks (
  id                  uuid   primary key default gen_random_uuid(),
  region_key          text   not null,
  category            text   not null,
  item_name_canonical text   not null,
  price_cents_p25     int    not null,
  price_cents_p50     int    not null,
  price_cents_p75     int    not null,
  source              text,
  collected_on        date   not null
);

create unique index on public.pricing_benchmarks (region_key, category, item_name_canonical);

alter table public.pricing_benchmarks enable row level security;

-- Authenticated users can select benchmark data
create policy "authenticated_read_pricing_benchmarks"
  on public.pricing_benchmarks
  for select
  to authenticated
  using (true);

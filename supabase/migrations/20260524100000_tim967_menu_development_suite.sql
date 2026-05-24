-- TIM-967: Menu Development Suite
-- Adds recipe column, menu_ingredients master list, menu_item_ingredients junction,
-- relaxes cogs_cents to nullable, and creates computed-COGS view.

-- ── 1. Add recipe column to menu_items ────────────────────────────────────────
alter table public.menu_items add column if not exists recipe jsonb not null default '{}';

-- ── 2. Make cogs_cents nullable (computed value will take precedence) ─────────
alter table public.menu_items alter column cogs_cents drop not null;
alter table public.menu_items alter column cogs_cents set default null;
update public.menu_items set cogs_cents = null where cogs_cents = 0;

-- ── 3. menu_ingredients: ingredient master list per plan ──────────────────────
create table public.menu_ingredients (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.coffee_shop_plans(id) on delete cascade,
  name                text not null,
  package_size        numeric(10,4) not null check (package_size > 0),
  package_unit        text not null check (package_unit in ('g', 'ml', 'oz', 'each')),
  package_cost_cents  integer not null default 0,
  vendor_id           uuid references public.vendors(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── 4. menu_item_ingredients: junction between items and ingredients ───────────
create table public.menu_item_ingredients (
  id              uuid primary key default gen_random_uuid(),
  menu_item_id    uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id   uuid not null references public.menu_ingredients(id) on delete cascade,
  amount          numeric(10,4) not null check (amount > 0),
  unit            text not null check (unit in ('g', 'ml', 'oz', 'each')),
  created_at      timestamptz not null default now(),
  unique(menu_item_id, ingredient_id)
);

-- ── 5. Computed COGS view ─────────────────────────────────────────────────────
-- Returns computed_cogs_cents = sum(amount * (package_cost_cents / package_size))
-- Falls back to manual cogs_cents, then 0.
create or replace view public.menu_items_with_cogs as
select
  mi.*,
  coalesce(
    (
      select round(
        sum(mii.amount * (ing.package_cost_cents::numeric / ing.package_size))
      )::integer
      from public.menu_item_ingredients mii
      join public.menu_ingredients ing on ing.id = mii.ingredient_id
      where mii.menu_item_id = mi.id
    ),
    mi.cogs_cents,
    0
  ) as computed_cogs_cents
from public.menu_items mi;

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
alter table public.menu_ingredients enable row level security;
alter table public.menu_item_ingredients enable row level security;

create policy "Users can manage own menu ingredients"
  on public.menu_ingredients for all
  using (exists (
    select 1 from public.coffee_shop_plans p
    where p.id = plan_id and p.user_id = auth.uid()
  ));

create policy "Users can manage own menu item ingredients"
  on public.menu_item_ingredients for all
  using (exists (
    select 1
    from public.menu_items mi
    join public.coffee_shop_plans p on p.id = mi.plan_id
    where mi.id = menu_item_id and p.user_id = auth.uid()
  ));

-- ── 7. Timestamp trigger ──────────────────────────────────────────────────────
create trigger handle_menu_ingredients_updated_at
  before update on public.menu_ingredients
  for each row execute procedure public.handle_updated_at();

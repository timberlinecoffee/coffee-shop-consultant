-- TIM-1140: Menu & Pricing founder feedback — editable categories,
-- category-level default ingredients, 'piece' unit, item position per
-- category. No menu_items data exists yet (4 plans, 0 items), so the
-- category-text → category_id conversion is a clean break.

create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.coffee_shop_plans(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index menu_categories_plan_id_idx on public.menu_categories(plan_id);
create unique index menu_categories_plan_name_unique on public.menu_categories(plan_id, lower(name));

insert into public.menu_categories (plan_id, name, position, is_default)
select p.id, c.name, c.pos, true
from public.coffee_shop_plans p
cross join (values
  ('Espresso',      0),
  ('Brewed Coffee', 1),
  ('Food',          2),
  ('Retail',        3),
  ('Seasonal',      4)
) as c(name, pos)
on conflict do nothing;

alter table public.menu_items add column category_id uuid;

update public.menu_items mi
set category_id = mc.id
from public.menu_categories mc
where mc.plan_id = mi.plan_id
  and mc.is_default = true
  and lower(mc.name) = case mi.category
    when 'espresso' then 'espresso'
    when 'brewed'   then 'brewed coffee'
    when 'food'     then 'food'
    when 'retail'   then 'retail'
    when 'seasonal' then 'seasonal'
    else mi.category
  end;

alter table public.menu_items
  add constraint menu_items_category_id_fkey
  foreign key (category_id) references public.menu_categories(id) on delete restrict;
alter table public.menu_items alter column category_id set not null;

drop view if exists public.menu_items_with_cogs;
alter table public.menu_items drop column category;
create index menu_items_category_id_idx on public.menu_items(category_id);

create table public.category_default_ingredients (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.menu_categories(id) on delete cascade,
  ingredient_id   uuid not null references public.menu_ingredients(id) on delete cascade,
  amount          numeric(10,4) not null check (amount > 0),
  unit            text not null check (unit in ('g', 'ml', 'oz', 'each', 'piece')),
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  unique(category_id, ingredient_id)
);
create index category_default_ingredients_category_id_idx
  on public.category_default_ingredients(category_id);

alter table public.menu_ingredients
  drop constraint menu_ingredients_package_unit_check;
alter table public.menu_ingredients
  add constraint menu_ingredients_package_unit_check
  check (package_unit in ('g', 'ml', 'oz', 'each', 'piece'));

alter table public.menu_item_ingredients
  drop constraint menu_item_ingredients_unit_check;
alter table public.menu_item_ingredients
  add constraint menu_item_ingredients_unit_check
  check (unit in ('g', 'ml', 'oz', 'each', 'piece'));

create view public.menu_items_with_cogs as
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

alter table public.menu_categories enable row level security;
alter table public.category_default_ingredients enable row level security;

create policy "Users can manage own menu categories"
  on public.menu_categories for all
  using (exists (
    select 1 from public.coffee_shop_plans p
    where p.id = plan_id and p.user_id = auth.uid()
  ));

create policy "Users can manage own category default ingredients"
  on public.category_default_ingredients for all
  using (exists (
    select 1
    from public.menu_categories mc
    join public.coffee_shop_plans p on p.id = mc.plan_id
    where mc.id = category_id and p.user_id = auth.uid()
  ));

create trigger handle_menu_categories_updated_at
  before update on public.menu_categories
  for each row execute procedure public.handle_updated_at();

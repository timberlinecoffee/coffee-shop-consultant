-- TIM-1140 follow-up: expose the joined category name on menu_items_with_cogs
-- so downstream consumers (business plan, financials, operations playbook,
-- PDF templates) don't need to add a separate join. category_id is already
-- on menu_items via mi.* so the view already exposes it.
drop view if exists public.menu_items_with_cogs;
create view public.menu_items_with_cogs as
select
  mi.*,
  mc.name as category_name,
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
from public.menu_items mi
left join public.menu_categories mc on mc.id = mi.category_id;

-- TIM-1322: editable "Expected popularity" per menu item, used by the
-- menu-engineering matrix. Groundwork is a pre-launch planning tool (no POS
-- sales history), so popularity is the owner's best estimate, not real sales:
-- low / medium / high. NULL = "not estimated yet".
alter table public.menu_items
  add column if not exists expected_popularity text
  check (expected_popularity is null or expected_popularity in ('low','medium','high'));

-- Recreate the COGS view so mi.* exposes the new column. Postgres freezes the
-- view's column list at creation time, so a column added to the base table does
-- not surface through mi.* until the view is recreated. Body is otherwise
-- identical to 20260527160936_tim1140_menu_items_view_category_name.sql.
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

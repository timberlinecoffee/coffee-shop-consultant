-- TIM-3861: add category column to menu_ingredients for Ingredients vs Supplies & Packaging grouping.
-- Values: 'ingredient' (food/beverage components) | 'supply' (disposables, packaging).
-- NULL means unclassified — the UI falls back to a keyword heuristic.
-- Rule 1: RLS already enabled on menu_ingredients; no new table, no new policy needed.
alter table public.menu_ingredients
  add column if not exists category text
  check (category in ('ingredient', 'supply'));

-- Backfill existing rows: names matching disposable/packaging keywords → 'supply'.
-- Remaining rows stay NULL (treated as 'ingredient' by the frontend heuristic).
update public.menu_ingredients
set category = 'supply'
where category is null
  and lower(name) ~ '(cup|cups|lid|lids|sleeve|sleeves|napkin|napkins|straw|straws|wrapper|wrappers|plate|plates|utensil|utensils|spoon|spoons|fork|forks|knife|knives|bag|bags|box|boxes|container|containers|packaging|wrap|wraps|seal|seals|tray|trays|doily|doilies)';

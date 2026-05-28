-- TIM-1005: Spreadsheet UI — add supplier column; expand category (14) +
-- financing_method (6) check constraints; keep legacy values for backward compat.

-- Add supplier column (nullable)
ALTER TABLE public.buildout_equipment_items
  ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Drop old category constraint and replace with 14-category set.
-- Old slug → new slug mapping (for reference only; old slugs kept valid):
--   espresso → espresso_platform, grinder (no 1:1), plumbing → plumbing_water,
--   furniture → furniture_fixtures, pos → pos_tech, signage → signage_decor
ALTER TABLE public.buildout_equipment_items
  DROP CONSTRAINT IF EXISTS buildout_equipment_items_category_check;

ALTER TABLE public.buildout_equipment_items
  ADD CONSTRAINT buildout_equipment_items_category_check
  CHECK (category IN (
    -- 14 new categories (TIM-1005 / TIM-1003)
    'espresso_platform',
    'brew_platform',
    'milk_beverage_prep',
    'refrigeration',
    'plumbing_water',
    'electrical',
    'pos_tech',
    'furniture_fixtures',
    'signage_decor',
    'smallwares',
    'ceramics',
    'glassware',
    'to_go_ware',
    'miscellaneous',
    -- legacy values kept for backward compat
    'espresso',
    'grinder',
    'plumbing',
    'furniture',
    'pos',
    'signage',
    'other'
  ));

-- Drop old financing_method constraint and replace with 6-option set.
ALTER TABLE public.buildout_equipment_items
  DROP CONSTRAINT IF EXISTS buildout_equipment_items_financing_method_check;

ALTER TABLE public.buildout_equipment_items
  ADD CONSTRAINT buildout_equipment_items_financing_method_check
  CHECK (financing_method IN (
    'cash',
    'in_house_financing',
    'loan',
    'lease',
    'credit_card',
    'other',
    -- legacy value kept for backward compat
    'credit'
  ));

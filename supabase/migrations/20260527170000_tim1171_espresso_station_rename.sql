-- TIM-1171: Rename espresso_platform → espresso_station at the DB boundary.
-- "Platform" language removed from the espresso bar. "Station" is the standard.
-- Applies to both the live plan items and the reference catalog.

-- 1. Drop constraint first so UPDATE is safe
ALTER TABLE public.buildout_equipment_items
  DROP CONSTRAINT IF EXISTS buildout_equipment_items_category_check;

-- 2. Migrate existing user data
UPDATE public.buildout_equipment_items
  SET category = 'espresso_station'
  WHERE category = 'espresso_platform';

-- 3. Update the reference catalog (seed data source)
UPDATE public.standard_equipment_reference
  SET category = 'espresso_station'
  WHERE category = 'espresso_platform';

-- 4. Re-add constraint including all observed + legacy values
ALTER TABLE public.buildout_equipment_items
  ADD CONSTRAINT buildout_equipment_items_category_check
  CHECK (category IN (
    -- current categories
    'espresso_station',
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
    'cleaning_sanitation',
    'cold_beverage',
    'food_prep',
    'tech_back_office',
    -- legacy values kept for backward compat
    'espresso_platform',
    'espresso',
    'grinder',
    'plumbing',
    'furniture',
    'pos',
    'signage',
    'other'
  ));

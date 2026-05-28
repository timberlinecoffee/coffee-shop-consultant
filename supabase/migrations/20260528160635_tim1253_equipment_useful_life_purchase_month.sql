-- TIM-1253: add useful_life_years and purchase_month to buildout_equipment_items
-- so each asset can carry its own depreciation horizon and capitalization month.
-- useful_life_years: 1–50y, defaults to 7 (industry average for coffee equipment).
-- purchase_month: 1–12, nullable — null means "month 1 of operations" (current behavior).

ALTER TABLE buildout_equipment_items
  ADD COLUMN IF NOT EXISTS useful_life_years integer NOT NULL DEFAULT 7
    CHECK (useful_life_years BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS purchase_month integer
    CHECK (purchase_month BETWEEN 1 AND 12);

COMMENT ON COLUMN buildout_equipment_items.useful_life_years IS
  'Straight-line depreciation horizon in years (1–50). Default 7y for equipment.';
COMMENT ON COLUMN buildout_equipment_items.purchase_month IS
  'Month in which this asset is capitalized (1=open month, NULL=month 1). Drives cash-flow investing outflow timing.';

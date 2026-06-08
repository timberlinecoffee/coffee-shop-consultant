-- TIM-2488: Rename buildout_equipment_items.cost_usd → cost_local.
--
-- The column is GENERATED ALWAYS (unit_cost_cents::numeric * quantity / 100.0)
-- so the rename is pure metadata — no data is at risk because the value is
-- recomputed from unit_cost_cents and quantity on read. We rename instead of
-- drop-and-recreate so dependent views/indexes (if any are added later) keep
-- their reference; PostgreSQL supports RENAME on generated columns directly.
--
-- Why: a Canadian/Australian/UK founder's exported business plan was rendering
-- equipment-cost columns as "Cost (USD)" because the field name implied USD.
-- The actual currency is the plan's `currency_code` (CAD/AUD/GBP/EUR); the
-- column carries the local-currency total of the line. Renaming it to
-- `cost_local` removes the USD inference at the schema layer.
--
-- Application code is updated in the same change set to read cost_local.
-- See TIM-2488 for the full audit + prompt-side USD scrub.

ALTER TABLE public.buildout_equipment_items
  RENAME COLUMN cost_usd TO cost_local;

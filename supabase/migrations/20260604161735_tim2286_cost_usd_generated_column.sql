-- TIM-2286: Add cost_usd as a generated column on buildout_equipment_items.
-- Multiple query sites referenced cost_usd (phantom) — it never existed.
-- The correct derivation is unit_cost_cents * quantity / 100.0 (total cost per line).
-- Generated column is read-only; INSERT/UPDATE uses unit_cost_cents as before.

ALTER TABLE public.buildout_equipment_items
  ADD COLUMN IF NOT EXISTS cost_usd numeric
    GENERATED ALWAYS AS (unit_cost_cents::numeric * quantity / 100.0) STORED;

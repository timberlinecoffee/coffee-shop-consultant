-- TIM-3575: Add is_archived column to business_plan_sections and
-- business_plan_custom_sections.
-- RLS is already enabled on both tables; deny-by-default policies are
-- unchanged — the new boolean column inherits existing policies.
-- Rule 1 cite: adds column to two existing RLS-enabled tables;
-- deny-by-default policies unchanged. No new policy needed.

ALTER TABLE business_plan_sections
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE business_plan_custom_sections
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

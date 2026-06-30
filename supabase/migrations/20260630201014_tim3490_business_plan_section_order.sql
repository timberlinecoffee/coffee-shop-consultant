-- TIM-3490: Per-plan top-level Business Plan section order.
--
-- The persisted order is an ordered array of stable section identifiers
-- (standard section keys like 'executive-summary' and custom-section UUIDs).
-- Empty array == "use the default order defined in src/lib/business-plan.ts".
-- Applications read through resolveSectionOrder() in
-- src/lib/business-plan/default-section-order.ts to overlay this on the
-- default array.
--
-- Per-user x per-plan by construction: coffee_shop_plans already keys on
-- user_id with owner-only RLS, so this column inherits ownership.
-- Additive + non-destructive: existing plans default to '[]' and render the
-- default order until the user reorders. Rollback path = single UPDATE
-- setting business_plan_section_order = '[]' (idempotent).

ALTER TABLE public.coffee_shop_plans
  ADD COLUMN IF NOT EXISTS business_plan_section_order jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.coffee_shop_plans.business_plan_section_order IS
  'TIM-3490: Ordered array of top-level Business Plan section identifiers (standard keys + custom-section UUIDs). Empty array means use the default order. Read via resolveSectionOrder().';

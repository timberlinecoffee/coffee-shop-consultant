-- TIM-3151: per-project onboarding interview answers (Pro multi-project).
-- Existing per-user answers in users.onboarding_data are untouched and
-- continue to serve the first project's intake context.
-- Idempotent: ADD COLUMN IF NOT EXISTS guard so reruns are safe.
--
-- RLS: inherited from coffee_shop_plans "Users can manage own plans" policy
-- (deny-by-default row-level; no separate column policy needed per Rule 1).

ALTER TABLE public.coffee_shop_plans
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb;

COMMENT ON COLUMN public.coffee_shop_plans.onboarding_data IS
  'Per-project onboarding interview answers (Pro multi-project, TIM-3151). '
  'NULL for projects created before TIM-3151 AND for projects where the founder '
  'skipped the intake. Shape mirrors users.onboarding_data. '
  'RLS inherited from coffee_shop_plans "Users can manage own plans" policy.';

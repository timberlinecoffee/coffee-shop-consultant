-- TIM-2376 / TIM-1953 2G-A: Multi-project schema foundation.
-- Single source of truth for a user's active plan: users.current_plan_id.
-- Idempotent: all statements use IF NOT EXISTS / WHERE IS NULL guards.

-- 1. Add current_plan_id to users (FK → coffee_shop_plans, SET NULL on plan delete)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_plan_id uuid
    REFERENCES public.coffee_shop_plans(id) ON DELETE SET NULL;

-- 2. Add location_label to coffee_shop_plans (multi-location display name)
ALTER TABLE public.coffee_shop_plans
  ADD COLUMN IF NOT EXISTS location_label text;

-- 3. Index for efficient most-recent-plan lookup (also speeds up the backfill below)
CREATE INDEX IF NOT EXISTS idx_coffee_shop_plans_user_created
  ON public.coffee_shop_plans(user_id, created_at DESC);

-- 4. Backfill: set current_plan_id to each user's most recently created plan
UPDATE public.users u
SET current_plan_id = (
  SELECT id
  FROM public.coffee_shop_plans
  WHERE user_id = u.id
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE u.current_plan_id IS NULL;

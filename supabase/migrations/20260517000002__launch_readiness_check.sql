-- TIM-736: Add latest_readiness_check to coffee_shop_plans for dashboard banner
ALTER TABLE coffee_shop_plans
  ADD COLUMN IF NOT EXISTS latest_readiness_check JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS latest_readiness_check_at TIMESTAMPTZ DEFAULT NULL;

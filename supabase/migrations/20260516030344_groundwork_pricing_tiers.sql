
-- Groundwork pricing: replace builder/accelerator tiers with starter/growth/pro
-- Existing 'builder' rows → 'starter', 'accelerator' rows → 'growth'

-- 1. Drop old check constraints
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

-- 2. Migrate existing tier data before adding new constraints
UPDATE public.users
  SET subscription_tier = 'starter'
  WHERE subscription_tier = 'builder';

UPDATE public.users
  SET subscription_tier = 'growth'
  WHERE subscription_tier = 'accelerator';

UPDATE public.subscriptions
  SET tier = 'starter'
  WHERE tier = 'builder';

UPDATE public.subscriptions
  SET tier = 'growth'
  WHERE tier = 'accelerator';

-- 3. Add new check constraints with Groundwork tier values
ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'starter', 'growth', 'pro'));

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('starter', 'growth', 'pro'));

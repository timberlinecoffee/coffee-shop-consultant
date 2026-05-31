-- TIM-1541: Add 'paused' status to users and subscriptions; add paused_from_tier and paused_at columns.

-- 1. users.subscription_status: add 'paused' to the check constraint.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_subscription_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('free_trial', 'active', 'cancelled', 'expired', 'paused'));

-- 2. subscriptions.status: add 'paused' to the check constraint.
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused'));

-- 3. New columns on subscriptions.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paused_from_tier text NULL,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL;

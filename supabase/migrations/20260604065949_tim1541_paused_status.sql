-- TIM-1541: Add 'paused' status to users and subscriptions; add paused_from_tier and paused_at columns.
--
-- Applied to prod (ltmcttjftxzpgynhnrpg) via apply_migration MCP on TIM-1603 (server-assigned
-- version 20260604065949). Original committed filename was 20260531225556; renamed to match
-- the schema_migrations row, per Path B in TIM-1603 instructions.
--
-- CTO note (TIM-1603 apply): The originally-committed file dropped 'past_due' from
-- users_subscription_status_check. That would have broken src/app/api/stripe/webhook/route.ts
-- (writes subscription_status='past_due' on invoice.payment_failed). 'past_due' was added by
-- TIM-642 (stripe_webhook_hardening, applied 20260516144935) and is load-bearing. The fix below
-- preserves past_due while adding 'paused'.

-- 1. users.subscription_status: add 'paused' to the check constraint (preserving past_due).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('free_trial', 'active', 'cancelled', 'expired', 'past_due', 'paused'));

-- 2. subscriptions.status: add 'paused' to the check constraint.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused'));

-- 3. New columns on subscriptions.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paused_from_tier text NULL,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL;

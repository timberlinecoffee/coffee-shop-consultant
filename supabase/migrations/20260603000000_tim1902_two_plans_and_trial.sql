-- TIM-1902: Collapse to two plans (Starter / Pro) and add the 7-day card-required
-- free trial. Approved by board on TIM-1898 §8 (confirmation 09434556, 2026-06-03).
--
-- Idempotent — safe to re-run.
--
-- Changes:
--   1. Grandfather any 'growth' subscribers to 'pro' (legacy Growth $99 ↔ new Pro $99).
--   2. Drop 'growth' from the users.subscription_tier check constraint.
--   3. Drop 'growth' from the subscriptions.tier check constraint.
--   4. Add users.trial_ends_at (the Stripe trial_end timestamp; null when not trialing).
--   5. Add users.trial_credits_granted (one-time grant flag — reuses the TIM-1825 scaffold).
--   6. Add users.past_due_since (first invoice.payment_failed timestamp for dunning grace).

-- ── 1. Backfill any legacy Growth rows to Pro ─────────────────────────────────
UPDATE public.users
   SET subscription_tier = 'pro'
 WHERE subscription_tier = 'growth';

UPDATE public.subscriptions
   SET tier = 'pro'
 WHERE tier = 'growth';

UPDATE public.subscriptions
   SET paused_from_tier = 'pro'
 WHERE paused_from_tier = 'growth';

-- ── 2. users.subscription_tier: drop 'growth' from allowed values ─────────────
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'starter', 'pro'));

-- ── 3. subscriptions.tier: drop 'growth' from allowed values ──────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('free', 'starter', 'pro'));

-- ── 4–6. Trial + dunning columns on users ─────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS trial_credits_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz NULL;

-- subscription_status check already includes 'free_trial' (TIM-1541). The
-- 7-day trial reuses that value; subscriptions.status uses the existing
-- 'trialing' value. No status constraint change is required.

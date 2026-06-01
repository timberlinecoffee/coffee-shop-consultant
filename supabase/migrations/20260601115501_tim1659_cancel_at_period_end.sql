-- TIM-1659: Track cancel_at_period_end state on subscriptions so DB/UI reflect
-- a scheduled cancellation (set via POST /api/billing/cancel) independently of
-- whether the subscription is currently active or paused.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

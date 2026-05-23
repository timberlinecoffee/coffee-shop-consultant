-- TIM-866: track free-trial Copilot usage separately from paid ai_credits_remaining.
-- Free-trial users get FREE_TRIAL_COPILOT_LIMIT (5) messages before hitting the paywall.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS copilot_trial_messages_used integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.copilot_trial_messages_used IS
  'Number of Copilot messages used during the free trial (free_trial subscription_status). Max 5.';

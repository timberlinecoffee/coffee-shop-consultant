-- TIM-819: Add server-side Copilot trial counter.
-- Free users get COPILOT_FREE_TRIAL_LIMIT (5) messages before hitting the upgrade gate.
-- Counter is incremented server-side only on successful stream completion.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS copilot_trial_messages_used integer NOT NULL DEFAULT 0;

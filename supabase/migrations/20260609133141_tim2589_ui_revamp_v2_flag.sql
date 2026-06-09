-- TIM-2589: Add ui_revamp_v2 boolean user preference for feature-flag
-- infrastructure. Defaults to true (new UI) for the rollout period; board
-- can flip individual users to false via the RevertToggle in Preferences.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ui_revamp_v2 boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.ui_revamp_v2 IS
  'Feature flag: true renders the revamped v2 UI surfaces, false falls back to v1. Overridable via ?ui=v1 or ?ui=v2 URL param (session only, no DB write).';

-- TIM-925: Add beta_waiver_until to users table.
-- When set, the paywall gate is bypassed until the timestamp expires.
-- Used for the Groundwork W6 launch beta testers (up to 5 accounts).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS beta_waiver_until timestamptz;

COMMENT ON COLUMN public.users.beta_waiver_until IS
  'If set and in the future, this account bypasses the paywall gate for the beta window. Set via admin SQL. TIM-925.';

-- TIM-1741 emergency mitigation applied by CEO via Supabase MCP during a Paperclip-API outage on 2026-06-03.
-- Prod logs (postgres service) showed a sustained flood of "column users.currency_code does not exist" errors.
-- App code on main was referencing these columns; the CTO's TIM-1741 migration had not landed (CTO heartbeat MCP unavailable,
-- board card 9bff0240 on TIM-1707 was the canonical credential ask and not yet accepted).
-- Spec verified against CEO memory + CTO description ("adds users.currency_code text, NULL = USD non-breaking,
-- and users.localization jsonb default {}"). Idempotent — IF NOT EXISTS — so CTO's later canonical migration
-- on branch feat/tim-1741-currency-settings will land cleanly without column collisions.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS localization jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.currency_code IS
  'TIM-1741 emergency-applied by CEO 2026-06-03 during Paperclip API outage. NULL = USD (non-breaking). CTO canonical migration may further refine.';
COMMENT ON COLUMN public.users.localization IS
  'TIM-1741 emergency-applied by CEO 2026-06-03 during Paperclip API outage. Per-user localization prefs. CTO canonical migration may further refine.';

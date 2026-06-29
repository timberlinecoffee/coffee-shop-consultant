-- TIM-3463: Scout multi-model — extend ai_turn_metrics for provider attribution.
--
-- Plan TIM-3333 §5 (rev 94e4b911). The base table from TIM-2361 covers per-turn
-- cost, plan tier, route, model, and cache breakdown. Multi-model rollout adds:
--   • provider — anthropic | deepseek; the upstream we actually billed against
--   • lane — routing-taxonomy id from src/lib/ai/scout-lane.ts. Stable string
--     so dashboards keep slicing the same buckets across renames.
--   • latency_ms — wall time, request open → last token. Used to track the
--     p95 latency budget post-flip (plan §9 step 6: +200ms vs Anthropic baseline).
--   • error_class — populated when the turn failed (matches scout-errors.ts).
--   • fallback_used — TRUE when cross-provider failover fired per plan §7.
--
-- Defaults preserve backwards compatibility: every existing logger that has not
-- yet been migrated to runScoutTurn keeps writing rows that look like the
-- previous schema (provider='anthropic', lane='unknown', fallback_used=false).
--
-- Rule 1 (TIM-2242) — RLS already enabled deny-by-default; this migration only
-- adds columns + indexes, no policy churn. Service role retains insert ability
-- via implicit bypass.

ALTER TABLE public.ai_turn_metrics
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;

-- Constrain provider to the known set. Add the constraint conditionally so
-- the migration is idempotent in case it re-runs against a partial state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_turn_metrics_provider_chk'
  ) THEN
    ALTER TABLE public.ai_turn_metrics
      ADD CONSTRAINT ai_turn_metrics_provider_chk
      CHECK (provider IN ('anthropic', 'deepseek'));
  END IF;
END $$;

-- Dashboard queries from plan §5 slice on (provider, lane, created_at) and the
-- fallback-rate query filters on fallback_used=true.
CREATE INDEX IF NOT EXISTS ai_turn_metrics_provider_lane_idx
  ON public.ai_turn_metrics (provider, lane, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_turn_metrics_fallback_idx
  ON public.ai_turn_metrics (fallback_used, created_at DESC)
  WHERE fallback_used = true;

COMMENT ON COLUMN public.ai_turn_metrics.provider IS
  'TIM-3463: anthropic|deepseek — the upstream we billed against (post-failover if applicable).';
COMMENT ON COLUMN public.ai_turn_metrics.lane IS
  'TIM-3463: routing taxonomy id from src/lib/ai/scout-lane.ts (e.g. chat_general, menu_suggest_items).';
COMMENT ON COLUMN public.ai_turn_metrics.latency_ms IS
  'TIM-3463: wall time request open → last token (ms).';
COMMENT ON COLUMN public.ai_turn_metrics.error_class IS
  'TIM-3463: scout-errors.ts class (rate_limit|auth|server|timeout|content_policy|unknown) on failed turns.';
COMMENT ON COLUMN public.ai_turn_metrics.fallback_used IS
  'TIM-3463: TRUE when cross-provider failover fired per plan §7.';

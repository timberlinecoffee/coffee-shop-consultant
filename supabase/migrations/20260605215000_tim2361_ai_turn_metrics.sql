-- TIM-2361: Per-turn AI telemetry sink.
--
-- One row per Anthropic turn from any Sonnet-routed (or Haiku-routed and opted
-- in) surface. Used to validate the ~$5-7/mo Pro COGS estimate from TIM-2306
-- and to tune the Sonnet routing thresholds with real data.
--
-- Service-role inserts only — RLS denies authenticated reads by default; the
-- CEO dashboard query runs through the service client. We intentionally do not
-- expose this to users (it is an internal cost/COGS lens).
--
-- Rule 1 — RLS enabled, deny-by-default.
-- Rule 2 — service-role bypasses RLS; the helper that writes this table runs
--   under the service client only (src/lib/ai/turn-metrics.ts).

CREATE TABLE IF NOT EXISTS public.ai_turn_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- API path that ran the turn, e.g. "/api/workspaces/menu-pricing/benchmark-price".
  route text NOT NULL,
  -- Anthropic model id, e.g. "claude-haiku-4-5-20251001" or "claude-sonnet-4-6".
  model_used text NOT NULL,
  -- Token splits as reported by the Anthropic SDK on the turn's usage block.
  input_tokens_cached_read integer NOT NULL DEFAULT 0,
  input_tokens_uncached integer NOT NULL DEFAULT 0,
  input_tokens_cache_create integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  -- Hosted research depth.
  web_search_requests integer NOT NULL DEFAULT 0,
  tool_calls integer NOT NULL DEFAULT 0,
  -- Credits charged for this turn (matches credit_transactions when present).
  credits_charged integer NOT NULL DEFAULT 0,
  -- USD cost estimate at the Anthropic price table in effect at log time.
  -- numeric(12,6) lets a single $0.000001 micro-cost round-trip without loss.
  cost_usd_estimate numeric(12, 6) NOT NULL DEFAULT 0,
  -- Plan attribution for the CEO weekly query. NULL when the turn ran without
  -- a logged-in user (should never happen on Pro-gated routes but defensive).
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- "pro" / "starter" / "free_trial" / "beta_waived" / "free" / "unknown".
  plan_tier text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CEO weekly query slices on (model_used, plan_tier, created_at) — index the lookup.
CREATE INDEX IF NOT EXISTS ai_turn_metrics_route_created_idx
  ON public.ai_turn_metrics (route, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_turn_metrics_model_plan_idx
  ON public.ai_turn_metrics (model_used, plan_tier, created_at DESC);

ALTER TABLE public.ai_turn_metrics ENABLE ROW LEVEL SECURITY;

-- Authenticated users see nothing — this is internal-only.
-- Service role bypasses RLS automatically, so the dashboard/cron readers and
-- the helper inserter both still work.
CREATE POLICY "ai_turn_metrics_deny_authenticated"
  ON public.ai_turn_metrics
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.ai_turn_metrics IS
  'TIM-2361: Per-turn AI cost/usage telemetry. Service-role inserts only; authenticated reads denied. CEO weekly query slices on (model_used, plan_tier).';

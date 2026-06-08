-- TIM-2509: Idempotent backfill of ai_turn_metrics from ai_conversations.
--
-- ## Why one-shot SQL (not a Node script)
--
-- This runs against prod via the Supabase MCP `apply_migration` tool OR via
-- `psql $SUPABASE_DB_URL -f` from a board member's shell. Service-role only.
-- We deliberately do not invoke this from a route handler — the population is
-- one-time, historical, and should be reviewed before each apply.
--
-- ## Mapping (aggregate per thread, NOT per turn)
--
-- ai_conversations holds one row per (plan_id, workspace_key, thread_id) and
-- aggregates credits/cost across every turn in that thread. ai_turn_metrics is
-- per turn. Backfill rows therefore represent threads, not turns, with these
-- caveats:
--   * `credits_charged` and `cost_usd_estimate` are CUMULATIVE for the thread
--   * `input_tokens_uncached` and `output_tokens` are NULL upstream → 0 here
--   * `web_search_requests` and `tool_calls` are unknown → 0 here
--   * `cache_read_tokens` / `cache_creation_tokens` map 1:1 where present
--
-- Live rows written by recordTurnMetric() carry route values like
-- "/api/copilot/stream". Backfill rows use the sentinel prefix
-- "backfill:ai_conversations:<workspace_key>" so percentile/COGS queries can
-- INCLUDE or EXCLUDE them with a single WHERE clause. Mixing is intentional
-- — the CEO weekly COGS query can include them to validate historical Pro
-- spend; per-turn percentile queries should exclude them.
--
-- ## Idempotency
--
-- DELETE-then-INSERT in a single transaction, keyed on the sentinel route
-- prefix. Safe to re-run; partial failures roll back. Adds zero new schema.
--
-- ## Apply
--
--   psql "$SUPABASE_DB_URL" -f scripts/tim2509-backfill-ai-turn-metrics.sql
--
-- or via Supabase MCP `apply_migration` (not a "real" migration — it touches
-- data, not schema — but the tool accepts arbitrary SQL).
--
-- ## Verify after apply
--
--   SELECT COUNT(*) FROM ai_turn_metrics WHERE route LIKE 'backfill:%';
--   SELECT route, COUNT(*), SUM(credits_charged), SUM(cost_usd_estimate)
--     FROM ai_turn_metrics WHERE route LIKE 'backfill:%' GROUP BY route;

BEGIN;

-- Idempotent: remove any prior backfill rows so re-running converges.
DELETE FROM public.ai_turn_metrics
WHERE route LIKE 'backfill:ai_conversations:%';

-- Backfill — one row per ai_conversations row.
INSERT INTO public.ai_turn_metrics (
  route,
  model_used,
  input_tokens_uncached,
  input_tokens_cached_read,
  input_tokens_cache_create,
  output_tokens,
  web_search_requests,
  tool_calls,
  credits_charged,
  cost_usd_estimate,
  user_id,
  plan_tier,
  created_at
)
SELECT
  'backfill:ai_conversations:' || COALESCE(ac.workspace_key, 'unknown') AS route,
  COALESCE(ac.model_used, 'unknown')                                  AS model_used,
  0                                                                   AS input_tokens_uncached,
  COALESCE(ac.cache_read_tokens, 0)                                   AS input_tokens_cached_read,
  COALESCE(ac.cache_creation_tokens, 0)                               AS input_tokens_cache_create,
  0                                                                   AS output_tokens,
  0                                                                   AS web_search_requests,
  0                                                                   AS tool_calls,
  COALESCE(ac.credits_used, 0)                                        AS credits_charged,
  COALESCE(ac.cost_usd, 0)                                            AS cost_usd_estimate,
  csp.user_id                                                         AS user_id,
  -- plan_tier resolved at backfill time (NOT historical). Mirrors
  -- src/lib/ai/turn-metrics.ts:resolvePlanTier — beta_waived only if the
  -- waiver is still in the future relative to NOW().
  CASE
    WHEN u.beta_waiver_until IS NOT NULL AND u.beta_waiver_until > NOW() THEN 'beta_waived'
    WHEN u.subscription_status = 'free_trial' THEN 'free_trial'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) = 'pro' THEN 'pro'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) = 'starter' THEN 'starter'
    WHEN LOWER(COALESCE(u.subscription_tier, '')) = 'free' THEN 'free'
    ELSE 'unknown'
  END                                                                 AS plan_tier,
  ac.created_at                                                       AS created_at
FROM public.ai_conversations ac
JOIN public.coffee_shop_plans csp ON csp.id = ac.plan_id
LEFT JOIN public.users u ON u.id = csp.user_id
-- Only backfill threads where the model actually billed credits — skip empty
-- placeholders (no model_used + no credits) that some legacy paths inserted.
WHERE COALESCE(ac.credits_used, 0) > 0
   OR ac.model_used IS NOT NULL;

COMMIT;

-- Verification (run separately after the transaction commits):
--   SELECT COUNT(*) AS backfilled FROM public.ai_turn_metrics
--     WHERE route LIKE 'backfill:ai_conversations:%';

-- Cache hit-rate query for ai_conversations (TIM-1275)
-- Run in Supabase SQL editor or psql to measure prompt-cache effectiveness.
--
-- cache_hits     = turns where the model read from the prompt cache
-- hit_rate_pct   = % of turns that hit the cache
-- avg_read_tokens = average tokens read from cache on cache-hit turns
-- total_cost_usd  = total AI spend in the window (for ROI comparison)

SELECT
  COUNT(*) AS turns,
  SUM(CASE WHEN cache_read_tokens > 0 THEN 1 ELSE 0 END) AS cache_hits,
  ROUND(100.0 * SUM(CASE WHEN cache_read_tokens > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS hit_rate_pct,
  AVG(cache_read_tokens) FILTER (WHERE cache_read_tokens > 0) AS avg_read_tokens,
  SUM(cost_usd) AS total_cost_usd
FROM ai_conversations
WHERE created_at > NOW() - INTERVAL '30 days';

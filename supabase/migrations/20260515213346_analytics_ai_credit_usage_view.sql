-- AI credit usage telemetry: cost and token breakdown by module
CREATE OR REPLACE VIEW analytics_ai_credit_usage AS
SELECT
  module_id,
  COUNT(*) AS call_count,
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(COALESCE(completion_tokens, 0)) AS total_completion_tokens,
  SUM(prompt_tokens + COALESCE(completion_tokens, 0)) AS total_tokens,
  ROUND(SUM(COALESCE(cost_usd, 0)), 4) AS total_cost_usd,
  ROUND(AVG(COALESCE(cost_usd, 0)), 4) AS avg_cost_per_call_usd,
  model,
  COUNT(DISTINCT user_id) AS distinct_users
FROM ai_usage_log
GROUP BY module_id, model
ORDER BY total_cost_usd DESC;

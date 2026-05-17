-- Daily briefing data block (5 metrics, last 24h + rolling windows)
CREATE OR REPLACE VIEW analytics_daily_brief AS
SELECT
  -- 1. New signups past 24h
  (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') AS new_signups_24h,

  -- 2. Onboarding completion rate (7-day rolling: completed / signed up in last 7 days)
  ROUND(
    (SELECT COUNT(*) FROM users WHERE onboarding_completed = true AND created_at > NOW() - INTERVAL '7 days')::numeric /
    NULLIF((SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'), 0) * 100,
    1
  ) AS onboarding_completion_pct_7d,

  -- 3. Active plans (at least 1 module touched in past 7 days)
  (SELECT COUNT(DISTINCT plan_id) FROM module_responses WHERE updated_at > NOW() - INTERVAL '7 days') AS active_plans_7d,

  -- 4. Paying customers (subscriptions.status = 'active')
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS paying_customers_total,

  -- 5. AI credits consumed past 24h (from ai_usage_log)
  COALESCE(
    (SELECT SUM(prompt_tokens + COALESCE(completion_tokens, 0)) FROM ai_usage_log WHERE occurred_at > NOW() - INTERVAL '24 hours'),
    0
  ) AS ai_tokens_consumed_24h,

  -- Bonus: cost in USD past 24h
  COALESCE(
    (SELECT SUM(cost_usd) FROM ai_usage_log WHERE occurred_at > NOW() - INTERVAL '24 hours'),
    0
  ) AS ai_cost_usd_24h,

  -- Metadata
  NOW() AS generated_at;

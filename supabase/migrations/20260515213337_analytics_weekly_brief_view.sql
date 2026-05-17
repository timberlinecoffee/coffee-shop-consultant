-- Weekly briefing data block (10 metrics)
CREATE OR REPLACE VIEW analytics_weekly_brief AS
WITH
  signups_7d AS (
    SELECT COUNT(*) AS cnt FROM users WHERE created_at > NOW() - INTERVAL '7 days'
  ),
  onboarding_done_7d AS (
    SELECT COUNT(*) AS cnt FROM users WHERE onboarding_completed = true AND created_at > NOW() - INTERVAL '7 days'
  ),
  module1_started_7d AS (
    SELECT COUNT(DISTINCT plan_id) AS cnt FROM module_responses
    WHERE module_number = 1 AND updated_at > NOW() - INTERVAL '7 days'
  ),
  module1_completed_7d AS (
    SELECT COUNT(DISTINCT plan_id) AS cnt FROM module_responses
    WHERE module_number = 1 AND status = 'completed' AND updated_at > NOW() - INTERVAL '7 days'
  ),
  new_paid_7d AS (
    SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'active' AND created_at > NOW() - INTERVAL '7 days'
  ),
  cancelled_7d AS (
    SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'cancelled' AND updated_at > NOW() - INTERVAL '7 days'
  ),
  paying_total AS (
    SELECT COUNT(DISTINCT user_id) AS cnt FROM subscriptions WHERE status = 'active'
  ),
  active_users_7d AS (
    SELECT COUNT(DISTINCT csp.user_id) AS cnt
    FROM module_responses mr
    JOIN coffee_shop_plans csp ON csp.id = mr.plan_id
    WHERE mr.updated_at > NOW() - INTERVAL '7 days'
  ),
  modules_completed_per_user AS (
    SELECT
      ROUND(
        COUNT(DISTINCT mr.plan_id || '-' || mr.module_number::text)::numeric /
        NULLIF((SELECT cnt FROM active_users_7d), 0), 2
      ) AS avg_val
    FROM module_responses mr
    WHERE mr.updated_at > NOW() - INTERVAL '7 days' AND mr.status = 'completed'
  ),
  ai_tokens_7d AS (
    SELECT COALESCE(SUM(prompt_tokens + COALESCE(completion_tokens, 0)), 0) AS total_tokens,
           COALESCE(SUM(cost_usd), 0) AS total_cost
    FROM ai_usage_log WHERE occurred_at > NOW() - INTERVAL '7 days'
  )
SELECT
  -- 1. WAMPC (from analytics_wampc view)
  (SELECT wampc FROM analytics_wampc) AS wampc,

  -- 2. Signup-to-onboarding conversion %
  ROUND((SELECT cnt FROM onboarding_done_7d)::numeric / NULLIF((SELECT cnt FROM signups_7d), 0) * 100, 1)
    AS signup_to_onboarding_pct,

  -- 3. Onboarding-to-module-1-start conversion %
  ROUND((SELECT cnt FROM module1_started_7d)::numeric / NULLIF((SELECT cnt FROM onboarding_done_7d), 0) * 100, 1)
    AS onboarding_to_module1_start_pct,

  -- 4. Module-1-start-to-completion conversion %
  ROUND((SELECT cnt FROM module1_completed_7d)::numeric / NULLIF((SELECT cnt FROM module1_started_7d), 0) * 100, 1)
    AS module1_start_to_completion_pct,

  -- 5. Module-completion-to-paid conversion %
  ROUND((SELECT cnt FROM new_paid_7d)::numeric / NULLIF((SELECT cnt FROM module1_completed_7d), 0) * 100, 1)
    AS module_completion_to_paid_pct,

  -- 6. Avg modules completed per active user (7-day)
  (SELECT avg_val FROM modules_completed_per_user) AS avg_modules_completed_per_active_user,

  -- 7. Total AI tokens consumed this week
  (SELECT total_tokens FROM ai_tokens_7d) AS ai_tokens_7d,

  -- 8. AI cost USD this week
  (SELECT total_cost FROM ai_tokens_7d) AS ai_cost_usd_7d,

  -- 9. New paid subscriptions this week
  (SELECT cnt FROM new_paid_7d) AS new_paid_subscriptions_7d,

  -- 10. Cancelled subscriptions this week
  (SELECT cnt FROM cancelled_7d) AS cancelled_subscriptions_7d,

  -- Context
  (SELECT cnt FROM paying_total) AS paying_customers_total,
  NOW() AS generated_at;

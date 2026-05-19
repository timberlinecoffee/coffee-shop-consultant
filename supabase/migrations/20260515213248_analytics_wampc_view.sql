-- North Star Metric: Weekly Active Modules Per Paying Customer
CREATE OR REPLACE VIEW analytics_wampc AS
SELECT
  COUNT(DISTINCT mr.plan_id || '-' || mr.module_number::text) AS active_module_weeks,
  COUNT(DISTINCT u.id) AS paying_customers,
  ROUND(
    COUNT(DISTINCT mr.plan_id || '-' || mr.module_number::text)::numeric /
    NULLIF(COUNT(DISTINCT u.id), 0), 2
  ) AS wampc
FROM users u
JOIN coffee_shop_plans csp ON csp.user_id = u.id
JOIN module_responses mr ON mr.plan_id = csp.id
WHERE u.subscription_status = 'active'
  AND mr.updated_at > NOW() - INTERVAL '7 days';

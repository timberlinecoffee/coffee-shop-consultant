-- Add signup_source to users for marketing attribution
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_source TEXT;

-- Add cost_usd to ai_conversations for direct cost accounting
ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS cost_usd NUMERIC;

-- Create analytics_funnel view
CREATE OR REPLACE VIEW public.analytics_funnel AS
SELECT
  COUNT(DISTINCT u.id) AS total_signups,
  COUNT(DISTINCT u.id) FILTER (WHERE u.onboarding_completed) AS onboarding_done,
  COUNT(DISTINCT csp.user_id) AS module_1_started,
  COUNT(DISTINCT mr.plan_id) FILTER (WHERE mr.module_number = 1 AND mr.status = 'completed') AS module_1_completed,
  COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active') AS paying_customers
FROM public.users u
LEFT JOIN public.coffee_shop_plans csp ON csp.user_id = u.id
LEFT JOIN public.module_responses mr ON mr.plan_id = csp.id AND mr.module_number = 1
LEFT JOIN public.subscriptions s ON s.user_id = u.id;

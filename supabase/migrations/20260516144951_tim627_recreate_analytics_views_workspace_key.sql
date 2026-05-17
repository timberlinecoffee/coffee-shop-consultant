-- Recreate analytics views against workspace_responses.workspace_key.
-- 'Module 1' semantics map to workspace_key='concept' (first workspace in the canonical order).
begin;

create view public.analytics_funnel as
select
  count(distinct u.id) as total_signups,
  count(distinct u.id) filter (where u.onboarding_completed) as onboarding_done,
  count(distinct csp.user_id) as module_1_started,
  count(distinct wr.plan_id) filter (where wr.workspace_key = 'concept' and wr.status = 'completed') as module_1_completed,
  count(distinct s.user_id) filter (where s.status = 'active') as paying_customers
from users u
  left join coffee_shop_plans csp on csp.user_id = u.id
  left join workspace_responses wr on wr.plan_id = csp.id and wr.workspace_key = 'concept'
  left join subscriptions s on s.user_id = u.id;

create view public.analytics_wampc as
select
  count(distinct (wr.plan_id || '-' || wr.workspace_key)) as active_module_weeks,
  count(distinct u.id) as paying_customers,
  round(count(distinct (wr.plan_id || '-' || wr.workspace_key))::numeric / nullif(count(distinct u.id),0)::numeric, 2) as wampc
from users u
  join coffee_shop_plans csp on csp.user_id = u.id
  join workspace_responses wr on wr.plan_id = csp.id
where u.subscription_status = 'active' and wr.updated_at > now() - interval '7 days';

create view public.analytics_daily_brief as
select
  (select count(*) from users where created_at > now() - interval '24 hours') as new_signups_24h,
  round((select count(*) from users where onboarding_completed = true and created_at > now() - interval '7 days')::numeric
        / nullif((select count(*) from users where created_at > now() - interval '7 days'),0)::numeric * 100, 1) as onboarding_completion_pct_7d,
  (select count(distinct plan_id) from workspace_responses where updated_at > now() - interval '7 days') as active_plans_7d,
  (select count(*) from subscriptions where status = 'active') as paying_customers_total,
  coalesce((select sum(prompt_tokens + coalesce(completion_tokens,0)) from ai_usage_log where occurred_at > now() - interval '24 hours'), 0::bigint) as ai_tokens_consumed_24h,
  coalesce((select sum(cost_usd) from ai_usage_log where occurred_at > now() - interval '24 hours'), 0::numeric) as ai_cost_usd_24h,
  now() as generated_at;

create view public.analytics_weekly_brief as
with signups_7d as (select count(*) cnt from users where created_at > now() - interval '7 days'),
  onboarding_done_7d as (select count(*) cnt from users where onboarding_completed = true and created_at > now() - interval '7 days'),
  module1_started_7d as (select count(distinct plan_id) cnt from workspace_responses where workspace_key = 'concept' and updated_at > now() - interval '7 days'),
  module1_completed_7d as (select count(distinct plan_id) cnt from workspace_responses where workspace_key = 'concept' and status = 'completed' and updated_at > now() - interval '7 days'),
  new_paid_7d as (select count(*) cnt from subscriptions where status = 'active' and created_at > now() - interval '7 days'),
  cancelled_7d as (select count(*) cnt from subscriptions where status = 'cancelled' and updated_at > now() - interval '7 days'),
  paying_total as (select count(distinct user_id) cnt from subscriptions where status = 'active'),
  active_users_7d as (select count(distinct csp.user_id) cnt from workspace_responses wr join coffee_shop_plans csp on csp.id = wr.plan_id where wr.updated_at > now() - interval '7 days'),
  modules_completed_per_user as (select round(count(distinct (wr.plan_id || '-' || wr.workspace_key))::numeric / nullif((select cnt from active_users_7d),0)::numeric, 2) avg_val from workspace_responses wr where wr.updated_at > now() - interval '7 days' and wr.status = 'completed'),
  ai_tokens_7d as (select coalesce(sum(prompt_tokens + coalesce(completion_tokens,0)),0::bigint) total_tokens, coalesce(sum(cost_usd),0::numeric) total_cost from ai_usage_log where occurred_at > now() - interval '7 days')
select
  (select wampc from analytics_wampc) as wampc,
  round((select cnt from onboarding_done_7d)::numeric / nullif((select cnt from signups_7d),0)::numeric * 100, 1) as signup_to_onboarding_pct,
  round((select cnt from module1_started_7d)::numeric / nullif((select cnt from onboarding_done_7d),0)::numeric * 100, 1) as onboarding_to_module1_start_pct,
  round((select cnt from module1_completed_7d)::numeric / nullif((select cnt from module1_started_7d),0)::numeric * 100, 1) as module1_start_to_completion_pct,
  round((select cnt from new_paid_7d)::numeric / nullif((select cnt from module1_completed_7d),0)::numeric * 100, 1) as module_completion_to_paid_pct,
  (select avg_val from modules_completed_per_user) as avg_modules_completed_per_active_user,
  (select total_tokens from ai_tokens_7d) as ai_tokens_7d,
  (select total_cost from ai_tokens_7d) as ai_cost_usd_7d,
  (select cnt from new_paid_7d) as new_paid_subscriptions_7d,
  (select cnt from cancelled_7d) as cancelled_subscriptions_7d,
  (select cnt from paying_total) as paying_customers_total,
  now() as generated_at;

commit;

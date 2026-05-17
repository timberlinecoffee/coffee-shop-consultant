-- TIM-627 staging prep: drop analytics views that reference module_responses.module_number.
-- They are recreated post-rename against workspace_responses.workspace_key.
begin;
drop view if exists public.analytics_weekly_brief;
drop view if exists public.analytics_daily_brief;
drop view if exists public.analytics_wampc;
drop view if exists public.analytics_funnel;
commit;

begin;
alter table public.coffee_shop_plans drop constraint if exists coffee_shop_plans_current_module_check;
alter table public.coffee_shop_plans drop column if exists current_module;
alter table public.coffee_shop_plans add column if not exists workspace_progress jsonb not null default '{}'::jsonb;
commit;

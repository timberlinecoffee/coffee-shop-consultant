-- TIM-627: coffee_shop_plans.current_module -> workspace_progress jsonb.
-- The 1..8 module axis is removed; per-workspace progress tracked as
-- { workspace_key: { status, completed_sections, ... } }.

begin;

alter table public.coffee_shop_plans
  drop constraint if exists coffee_shop_plans_current_module_check;

alter table public.coffee_shop_plans
  drop column if exists current_module;

alter table public.coffee_shop_plans
  add column if not exists workspace_progress jsonb not null default '{}'::jsonb;

commit;

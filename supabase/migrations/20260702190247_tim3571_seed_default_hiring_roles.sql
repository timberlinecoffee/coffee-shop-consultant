-- TIM-3571 — seed 4 default hiring roles on every new coffee_shop_plans row
-- and backfill existing plans that currently have zero roles.
--
-- Why: v2 Hiring workspace renders an empty left-nav for plans with 0 roles,
-- reading as "broken" (TIM-3558 → TIM-3567 board flag). Seeding a small,
-- editable set of defaults matches the smallest-diff systemic fix (option B
-- SHIP-DEFAULTS) confirmed on TIM-3571.
--
-- Defaults are Title Case per TIM-1002 (Barista, Shift Lead, Assistant
-- Manager, General Manager). Users can rename / delete freely.
--
-- Idempotent by design: the seed function is a no-op if the plan already
-- has any rows in hiring_plan_roles, so the trigger is safe to re-fire and
-- the backfill is safe to re-run.

create or replace function public.seed_default_hiring_roles_for_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from hiring_plan_roles where plan_id = p_plan_id) then
    return;
  end if;

  insert into hiring_plan_roles (plan_id, role_title, headcount, order_index) values
    (p_plan_id, 'Barista', 3, 0),
    (p_plan_id, 'Shift Lead', 2, 1),
    (p_plan_id, 'Assistant Manager', 1, 2),
    (p_plan_id, 'General Manager', 1, 3);
end;
$$;

comment on function public.seed_default_hiring_roles_for_plan(uuid) is
  'TIM-3571 — seed 4 default Title Case hiring roles for a plan if it has none. Idempotent no-op when the plan already has any hiring_plan_roles rows.';

create or replace function public.trg_seed_hiring_roles_on_plan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_hiring_roles_for_plan(new.id);
  return new;
end;
$$;

drop trigger if exists tim3571_seed_hiring_roles on public.coffee_shop_plans;
create trigger tim3571_seed_hiring_roles
after insert on public.coffee_shop_plans
for each row
execute function public.trg_seed_hiring_roles_on_plan_insert();

-- Backfill: seed defaults for every existing plan that has zero roles.
-- Uses the same idempotent function; a plan with any existing row is skipped.
select public.seed_default_hiring_roles_for_plan(p.id)
from public.coffee_shop_plans p
where not exists (select 1 from public.hiring_plan_roles r where r.plan_id = p.id);

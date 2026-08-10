-- TIM-3453: tell a seeded staffing plan apart from the owner's.
--
-- On every new plan, a trigger inserts four roles totalling 7 people. The
-- financial model separately seeds 3. detectHiringFinancialsConflict compares
-- the two totals, sees 7 != 3, and reports "1 plan conflict found" on an
-- account where the owner has entered nothing. The product invents two
-- different numbers and then reports its own disagreement as the owner's
-- mistake. It is the last piece of the seeding work in TIM-3448 / TIM-3449.
--
-- The seeded roles themselves stay: four role types with sensible titles are
-- useful scaffolding for a first-time owner. What was missing is any way to
-- tell our guess from their decision, so this adds the marker the table never
-- had. Compare launch_milestones.source and menu_categories.is_default, which
-- already do the same thing for their seeded rows.
--
-- NON-DESTRUCTIVE. Nothing is deleted and no owner data is touched. The
-- backfill marks a plan 'seed' only when its role set is EXACTLY the seeded
-- shape and no start date, monthly cost or note has ever been entered on any
-- of its rows. Measured against production before writing this: 60 of 72 plans
-- match (240 rows), the remaining 12 (46 rows) stay 'user'. Failing toward
-- 'user' is deliberate — wrongly treating someone's real staffing as our seed
-- would suppress a conflict they need to see.

alter table public.hiring_plan_roles
  add column if not exists source text not null default 'user';

alter table public.hiring_plan_roles
  drop constraint if exists hiring_plan_roles_source_check;

alter table public.hiring_plan_roles
  add constraint hiring_plan_roles_source_check
  check (source in ('seed', 'user'));

comment on column public.hiring_plan_roles.source is
  'TIM-3453: ''seed'' means this row came from the plan-insert trigger and the owner has not claimed it; ''user'' means it is theirs. Cross-workspace conflict detection stays silent while both sides are still seed.';

with untouched as (
  select plan_id
  from public.hiring_plan_roles
  group by plan_id
  having count(*) = 4
     and sum(headcount) = 7
     and string_agg(role_title || ':' || headcount, ', ' order by role_title)
         = 'Assistant Manager:1, Barista:3, General Manager:1, Shift Lead:2'
     and bool_and(start_date is null and monthly_cost_cents is null and notes is null)
)
update public.hiring_plan_roles r
   set source = 'seed'
  from untouched u
 where r.plan_id = u.plan_id;

-- Future plans stamp their own seed. Body is otherwise unchanged from
-- 20260702190247_tim3571_seed_default_hiring_roles.sql — same guard, same four
-- roles, same order. SECURITY DEFINER with a pinned search_path is retained,
-- and neither this function nor its trigger reads current_user, so the
-- session_user rule in AGENTS.md has nothing to correct here.
create or replace function public.seed_default_hiring_roles_for_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from hiring_plan_roles where plan_id = p_plan_id) then
    return;
  end if;

  insert into hiring_plan_roles (plan_id, role_title, headcount, order_index, source) values
    (p_plan_id, 'Barista', 3, 0, 'seed'),
    (p_plan_id, 'Shift Lead', 2, 1, 'seed'),
    (p_plan_id, 'Assistant Manager', 1, 2, 'seed'),
    (p_plan_id, 'General Manager', 1, 3, 'seed');
end;
$function$;

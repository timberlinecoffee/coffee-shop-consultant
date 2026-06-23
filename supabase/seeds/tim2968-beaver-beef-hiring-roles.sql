-- TIM-2968: Seed hiring roles with parent_role_id + order_index for trent@simpler.coffee
-- "Beaver & Beef" demo persona. Fixes regression from TIM-1900 where the chart
-- rendered flat because fixture data had no parent links.
--
-- Hierarchy:
--   0. Owner / Founder  (root)
--     1. Store Manager  (reports to Owner)
--       2. Head Barista  (reports to Store Manager)
--         3. Barista     (reports to Head Barista)
--         3. Barista Trainer (reports to Head Barista)
--
-- Safe to re-run (DELETE + fixed UUIDs).

do $$
declare
  demo_user_id uuid;
  demo_plan_id uuid;

  role_owner   uuid := 'bb000010-0000-0000-0000-000000000001';
  role_mgr     uuid := 'bb000010-0000-0000-0000-000000000002';
  role_head    uuid := 'bb000010-0000-0000-0000-000000000003';
  role_bar     uuid := 'bb000010-0000-0000-0000-000000000004';
  role_trainer uuid := 'bb000010-0000-0000-0000-000000000005';
begin
  select id into demo_user_id
    from auth.users
   where email = 'trent@simpler.coffee'
   limit 1;

  if demo_user_id is null then
    raise notice 'User trent@simpler.coffee not found — skipping hiring roles seed.';
    return;
  end if;

  select id into demo_plan_id
    from public.coffee_shop_plans
   where user_id = demo_user_id
   order by created_at
   limit 1;

  if demo_plan_id is null then
    raise notice 'No plan found for trent@simpler.coffee — skipping hiring roles seed.';
    return;
  end if;

  -- Clear old fixture roles for idempotency
  delete from public.hiring_plan_roles
   where id in (role_owner, role_mgr, role_head, role_bar, role_trainer);

  -- Insert with parent links and order_index
  insert into public.hiring_plan_roles
    (id, plan_id, role_title, headcount, status, parent_role_id, order_index)
  values
    (role_owner,   demo_plan_id, 'Owner / Founder', 1, 'hired',        null,       0),
    (role_mgr,     demo_plan_id, 'Store Manager',   1, 'interviewing', role_owner, 0),
    (role_head,    demo_plan_id, 'Head Barista',     1, 'posted',       role_mgr,   0),
    (role_bar,     demo_plan_id, 'Barista',          2, 'planned',      role_head,  0),
    (role_trainer, demo_plan_id, 'Barista Trainer',  1, 'planned',      role_head,  1);

  raise notice 'Inserted 5 hiring roles for trent@simpler.coffee (plan %).', demo_plan_id;
end $$;

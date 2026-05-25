-- TIM-731 / TIM-624-A: launch_plan workspace tables + RLS
-- W6 Launch Plan schema: launch_timeline_items, soft_open_plan_items,
-- marketing_kickoff_items, hiring_plan_roles. RLS mirrors menu_items
-- (plan owner via public.coffee_shop_plans.user_id = auth.uid()).

-- ── Enums ──────────────────────────────────────────────────────────────────────

create type public.launch_item_status as enum (
  'pending',
  'in_progress',
  'done',
  'at_risk'
);

create type public.hiring_role_status as enum (
  'planned',
  'posted',
  'interviewing',
  'hired'
);

-- ── launch_timeline_items ──────────────────────────────────────────────────────

create table public.launch_timeline_items (
  id          uuid                       primary key default gen_random_uuid(),
  plan_id     uuid                       not null references public.coffee_shop_plans(id) on delete cascade,
  milestone   text                       not null,
  target_date date,
  status      public.launch_item_status  not null default 'pending',
  depends_on  uuid                       references public.launch_timeline_items(id) on delete set null,
  notes       text,
  order_index int                        not null default 0,
  digest      jsonb                      not null default '{}'::jsonb,
  created_at  timestamptz                not null default now(),
  updated_at  timestamptz                not null default now()
);

create index on public.launch_timeline_items (plan_id, order_index);
create index on public.launch_timeline_items (depends_on) where depends_on is not null;

alter table public.launch_timeline_items enable row level security;

create policy "plan_owner_read_launch_timeline_items"
  on public.launch_timeline_items
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_launch_timeline_items"
  on public.launch_timeline_items
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create trigger handle_launch_timeline_items_updated_at
  before update on public.launch_timeline_items
  for each row execute procedure public.handle_updated_at();

-- ── soft_open_plan_items ───────────────────────────────────────────────────────

create table public.soft_open_plan_items (
  id          uuid                       primary key default gen_random_uuid(),
  plan_id     uuid                       not null references public.coffee_shop_plans(id) on delete cascade,
  day_offset  int                        not null check (day_offset between -7 and 30),
  task        text                       not null,
  owner       text,
  status      public.launch_item_status  not null default 'pending',
  notes       text,
  created_at  timestamptz                not null default now(),
  updated_at  timestamptz                not null default now()
);

create index on public.soft_open_plan_items (plan_id, day_offset);

alter table public.soft_open_plan_items enable row level security;

create policy "plan_owner_read_soft_open_plan_items"
  on public.soft_open_plan_items
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_soft_open_plan_items"
  on public.soft_open_plan_items
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create trigger handle_soft_open_plan_items_updated_at
  before update on public.soft_open_plan_items
  for each row execute procedure public.handle_updated_at();

-- ── marketing_kickoff_items ────────────────────────────────────────────────────

create table public.marketing_kickoff_items (
  id          uuid                       primary key default gen_random_uuid(),
  plan_id     uuid                       not null references public.coffee_shop_plans(id) on delete cascade,
  channel     text                       not null,
  asset       text                       not null,
  launch_date date,
  status      public.launch_item_status  not null default 'pending',
  responsible text,
  notes       text,
  created_at  timestamptz                not null default now(),
  updated_at  timestamptz                not null default now()
);

create index on public.marketing_kickoff_items (plan_id, launch_date);

alter table public.marketing_kickoff_items enable row level security;

create policy "plan_owner_read_marketing_kickoff_items"
  on public.marketing_kickoff_items
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_marketing_kickoff_items"
  on public.marketing_kickoff_items
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create trigger handle_marketing_kickoff_items_updated_at
  before update on public.marketing_kickoff_items
  for each row execute procedure public.handle_updated_at();

-- ── hiring_plan_roles ──────────────────────────────────────────────────────────

create table public.hiring_plan_roles (
  id                 uuid                       primary key default gen_random_uuid(),
  plan_id            uuid                       not null references public.coffee_shop_plans(id) on delete cascade,
  role_title         text                       not null,
  headcount          int                        not null default 1 check (headcount >= 0),
  start_date         date,
  monthly_cost_cents int                        check (monthly_cost_cents is null or monthly_cost_cents >= 0),
  status             public.hiring_role_status  not null default 'planned',
  notes              text,
  created_at         timestamptz                not null default now(),
  updated_at         timestamptz                not null default now()
);

create index on public.hiring_plan_roles (plan_id, start_date);

alter table public.hiring_plan_roles enable row level security;

create policy "plan_owner_read_hiring_plan_roles"
  on public.hiring_plan_roles
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_hiring_plan_roles"
  on public.hiring_plan_roles
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create trigger handle_hiring_plan_roles_updated_at
  before update on public.hiring_plan_roles
  for each row execute procedure public.handle_updated_at();

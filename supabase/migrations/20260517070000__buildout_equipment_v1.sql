-- TIM-721 / TIM-623-A: buildout_equipment workspace tables + RLS
-- W5 Build-out & Equipment schema per TIM-623 plan §2.
-- buildout_equipment_items: per-plan equipment rows, plan-owner RLS (mirrors menu_items).
-- standard_equipment_reference: read-only reference list, select for authenticated, write service-role only.

-- ── buildout_equipment_items ───────────────────────────────────────────────────

create table public.buildout_equipment_items (
  id              uuid        primary key default gen_random_uuid(),
  plan_id         uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  position        int         not null default 0,
  name            text        not null,
  category        text        not null check (category in (
    'espresso',
    'grinder',
    'refrigeration',
    'plumbing',
    'electrical',
    'furniture',
    'smallwares',
    'pos',
    'signage',
    'other'
  )),
  vendor          text,
  model           text,
  quantity        int         not null default 1 check (quantity >= 0),
  unit_cost_cents int         not null default 0 check (unit_cost_cents >= 0),
  priority_tier   text        not null default 'must_have' check (priority_tier in ('must_have', 'nice_to_have')),
  notes           text,
  archived        bool        not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.buildout_equipment_items (plan_id) where archived = false;
create index on public.buildout_equipment_items (plan_id, position);

alter table public.buildout_equipment_items enable row level security;

create policy "plan_owner_read_buildout_equipment_items"
  on public.buildout_equipment_items
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_buildout_equipment_items"
  on public.buildout_equipment_items
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

create trigger handle_buildout_equipment_items_updated_at
  before update on public.buildout_equipment_items
  for each row execute procedure public.handle_updated_at();

-- ── standard_equipment_reference ───────────────────────────────────────────────

create table public.standard_equipment_reference (
  id              uuid        primary key default gen_random_uuid(),
  menu_profile    text        not null check (menu_profile in (
    'espresso_focused',
    'espresso_plus_brew',
    'full_drip',
    'full_food'
  )),
  category        text        not null,
  name_canonical  text        not null,
  must_have       bool        not null default true,
  rationale       text        not null,
  created_at      timestamptz not null default now(),
  unique (menu_profile, name_canonical)
);

create index on public.standard_equipment_reference (menu_profile);

alter table public.standard_equipment_reference enable row level security;

-- Any authenticated user can read the reference catalog.
create policy "authenticated_read_standard_equipment_reference"
  on public.standard_equipment_reference
  for select
  to authenticated
  using (true);

-- Writes are service-role only. Explicit policy so audits show the intent
-- (service_role bypasses RLS by default, but be explicit).
create policy "service_role_write_standard_equipment_reference"
  on public.standard_equipment_reference
  for all
  to service_role
  using (true)
  with check (true);

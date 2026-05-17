-- TIM-721 / TIM-623-A: Build-out & Equipment workspace schema
-- Adds buildout_equipment_items (per-plan) and standard_equipment_reference (read-only reference).

-- ── buildout_equipment_items ──────────────────────────────────────────────────

create table public.buildout_equipment_items (
  id               uuid        primary key default gen_random_uuid(),
  plan_id          uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  name             text        not null,
  category         text        not null,
  vendor           text,
  model            text,
  quantity         integer     not null default 1 check (quantity > 0),
  unit_cost_cents  integer     not null default 0 check (unit_cost_cents >= 0),
  priority_tier    text        not null default 'nice_to_have' check (priority_tier in ('must_have', 'important', 'nice_to_have')),
  notes            text,
  archived         boolean     not null default false,
  position         integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.buildout_equipment_items enable row level security;

create policy "plan_owner_all_buildout_equipment_items"
  on public.buildout_equipment_items
  for all
  using (
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

-- ── standard_equipment_reference ─────────────────────────────────────────────

create table public.standard_equipment_reference (
  id               uuid        primary key default gen_random_uuid(),
  menu_profile     text        not null,
  category         text        not null,
  name_canonical   text        not null,
  must_have        boolean     not null default false,
  rationale        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (menu_profile, category, name_canonical)
);

alter table public.standard_equipment_reference enable row level security;

-- Authenticated users can read; writes are service-role only (no permissive policy for writes).
create policy "authenticated_read_standard_equipment_reference"
  on public.standard_equipment_reference
  for select
  to authenticated
  using (true);

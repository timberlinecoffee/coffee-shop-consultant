-- TIM-734 / TIM-624-D: reference tables for launch milestones + hiring roles
-- These are read-only reference datasets (no RLS — world-readable, no auth.uid() check).
-- Seeded immediately below in supabase/seeds/standard_launch_plan_seeds.sql.

-- ── standard_launch_milestones ─────────────────────────────────────────────────

create table if not exists public.standard_launch_milestones (
  id              uuid    primary key default gen_random_uuid(),
  day_offset      int     not null,           -- negative = T-minus, 0 = Day 0, positive = post-open
  title           text    not null,
  recommended_owner text  not null,
  dependency_hint text,                       -- short note on what must come first
  why             text    not null,           -- AI-context copy explaining importance
  created_at      timestamptz not null default now()
);

comment on table public.standard_launch_milestones is
  'Reference dataset of ~10 pre-seeded launch milestones for a specialty coffee business. '
  'Used by AI anchors in the W6 Launch Plan workspace as starter templates.';

-- Public read — no PII, no tenant data.
alter table public.standard_launch_milestones enable row level security;

create policy "public_read_standard_launch_milestones"
  on public.standard_launch_milestones
  for select
  using (true);

-- ── standard_hiring_roles ──────────────────────────────────────────────────────

create table if not exists public.standard_hiring_roles (
  id                    uuid    primary key default gen_random_uuid(),
  role_title            text    not null,
  hours_per_week_typical numeric(5,1) not null,
  rate_low_cents        int     not null,  -- hourly, Pacific NW market low (p25)
  rate_high_cents       int     not null,  -- hourly, Pacific NW market high (p75)
  start_date_offset_days int    not null,  -- days from Day 0 (negative = pre-open)
  notes                 text,
  created_at            timestamptz not null default now()
);

comment on table public.standard_hiring_roles is
  'Reference dataset of 7 typical hiring roles for a solo-operated coffee education business. '
  'Rate ranges are Pacific NW market (2026). Used by AI anchors in the W6 Launch Plan workspace.';

alter table public.standard_hiring_roles enable row level security;

create policy "public_read_standard_hiring_roles"
  on public.standard_hiring_roles
  for select
  using (true);

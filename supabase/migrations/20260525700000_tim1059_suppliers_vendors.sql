-- TIM-1059: Suppliers & Vendors workspace.
-- Adds vendor_candidates (per-category comparison rows) and vendor_decisions
-- (decision log for chosen vendors).  Categories live as a CHECK constraint on
-- vendor_candidates.category so the set is the source of truth and matches the
-- nine UI sections (coffee_roaster, dairy_altmilk, bakery, syrups_sauces, tea,
-- packaging, cleaning_chemicals, equipment_service, other).
--
-- We deliberately do NOT extend the legacy public.vendors table — it is
-- referenced by menu_ingredients.vendor_id and uses a different category
-- vocabulary.  Suppliers workspace is a clean break, side-by-side comparison.

create table if not exists public.vendor_candidates (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.coffee_shop_plans(id) on delete cascade,
  category        text not null check (category in (
                    'coffee_roaster',
                    'dairy_altmilk',
                    'bakery',
                    'syrups_sauces',
                    'tea',
                    'packaging',
                    'cleaning_chemicals',
                    'equipment_service',
                    'other'
                  )),
  name            text not null default '',
  contact         text,
  price_per_unit  text,
  minimum_order   text,
  lead_time       text,
  notes           text,
  status          text not null default 'researching' check (status in (
                    'researching', 'shortlisted', 'chosen', 'rejected'
                  )),
  source          text not null default 'user_added' check (source in (
                    'ai_suggested', 'user_added'
                  )),
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_vendor_candidates_plan_category
  on public.vendor_candidates (plan_id, category, position);

alter table public.vendor_candidates enable row level security;

create policy "vendor_candidates_owner_all" on public.vendor_candidates
  for all using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create or replace function public.fn_vendor_candidates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vendor_candidates_updated_at on public.vendor_candidates;
create trigger trg_vendor_candidates_updated_at
  before update on public.vendor_candidates
  for each row execute function public.fn_vendor_candidates_updated_at();

-- Decision log: captured when a vendor row is marked `chosen`.
-- One row per (plan_id, category) is the normal state; multiple rows are
-- allowed so a re-decision is auditable.

create table if not exists public.vendor_decisions (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.coffee_shop_plans(id) on delete cascade,
  category      text not null check (category in (
                  'coffee_roaster',
                  'dairy_altmilk',
                  'bakery',
                  'syrups_sauces',
                  'tea',
                  'packaging',
                  'cleaning_chemicals',
                  'equipment_service',
                  'other'
                )),
  candidate_id  uuid references public.vendor_candidates(id) on delete set null,
  vendor_name   text not null,
  decided_on    date not null default current_date,
  reason        text,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_vendor_decisions_plan_category
  on public.vendor_decisions (plan_id, category, is_current);

alter table public.vendor_decisions enable row level security;

create policy "vendor_decisions_owner_all" on public.vendor_decisions
  for all using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

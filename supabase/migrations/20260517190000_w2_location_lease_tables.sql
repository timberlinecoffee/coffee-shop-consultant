-- W2 Location & Lease workspace tables
-- TIM-775 / TIM-620-A

-- ─────────────────────────────────────────────────────────────────────────────
-- location_candidates: per-plan candidate sites
-- ─────────────────────────────────────────────────────────────────────────────
create table public.location_candidates (
  id                uuid        primary key default gen_random_uuid(),
  plan_id           uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  position          int         not null default 0,
  name              text        not null,
  address           text,
  neighborhood      text,
  sq_ft             int         check (sq_ft is null or sq_ft >= 0),
  asking_rent_cents int         check (asking_rent_cents is null or asking_rent_cents >= 0),
  cam_cents         int         check (cam_cents is null or cam_cents >= 0),
  listing_url       text,
  broker_contact    text,
  status            text        not null default 'shortlisted'
                                check (status in ('shortlisted','viewing_scheduled','lease_review','passed','signed')),
  notes             text,
  archived          bool        not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on public.location_candidates (plan_id) where archived = false;

alter table public.location_candidates enable row level security;

create policy plan_owner_read_location_candidates
  on public.location_candidates for select
  using (exists (
    select 1 from public.coffee_shop_plans p
    where p.id = location_candidates.plan_id
      and p.user_id = auth.uid()
  ));

create policy plan_owner_write_location_candidates
  on public.location_candidates for all
  using (exists (
    select 1 from public.coffee_shop_plans p
    where p.id = location_candidates.plan_id
      and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- location_rubric_scores: 6 fixed factors × candidate
-- ─────────────────────────────────────────────────────────────────────────────
create table public.location_rubric_scores (
  id           uuid        primary key default gen_random_uuid(),
  candidate_id uuid        not null references public.location_candidates(id) on delete cascade,
  factor_key   text        not null
               check (factor_key in (
                 'foot_traffic','parking_transit','visibility',
                 'neighborhood_fit','buildout_cost_estimate','lease_terms'
               )),
  score_1_5    int         check (score_1_5 between 1 and 5),
  notes        text,
  updated_at   timestamptz not null default now(),
  unique (candidate_id, factor_key)
);

alter table public.location_rubric_scores enable row level security;

create policy plan_owner_read_location_rubric_scores
  on public.location_rubric_scores for select
  using (exists (
    select 1
    from public.location_candidates c
    join public.coffee_shop_plans p on p.id = c.plan_id
    where c.id = location_rubric_scores.candidate_id
      and p.user_id = auth.uid()
  ));

create policy plan_owner_write_location_rubric_scores
  on public.location_rubric_scores for all
  using (exists (
    select 1
    from public.location_candidates c
    join public.coffee_shop_plans p on p.id = c.plan_id
    where c.id = location_rubric_scores.candidate_id
      and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- location_lease_terms: 1:1 per candidate; tracks LOI / lease snapshot
-- ─────────────────────────────────────────────────────────────────────────────
create table public.location_lease_terms (
  id                     uuid        primary key default gen_random_uuid(),
  candidate_id           uuid        not null unique references public.location_candidates(id) on delete cascade,
  base_rent_cents        int         check (base_rent_cents is null or base_rent_cents >= 0),
  rent_escalation_pct    numeric(5,2),                        -- annual %; 3.50 = 3.5%
  security_deposit_cents int         check (security_deposit_cents is null or security_deposit_cents >= 0),
  ti_allowance_cents     int         check (ti_allowance_cents is null or ti_allowance_cents >= 0),
  term_months            int         check (term_months is null or term_months >= 0),
  options_text           text,                                -- e.g. "2x 5-year options"
  personal_guarantee     text,                                -- none | limited | full | freeform
  exit_clauses           text,                                -- co-tenancy / kick-out / assignment summary
  updated_at             timestamptz not null default now()
);

alter table public.location_lease_terms enable row level security;

create policy plan_owner_read_location_lease_terms
  on public.location_lease_terms for select
  using (exists (
    select 1
    from public.location_candidates c
    join public.coffee_shop_plans p on p.id = c.plan_id
    where c.id = location_lease_terms.candidate_id
      and p.user_id = auth.uid()
  ));

create policy plan_owner_write_location_lease_terms
  on public.location_lease_terms for all
  using (exists (
    select 1
    from public.location_candidates c
    join public.coffee_shop_plans p on p.id = c.plan_id
    where c.id = location_lease_terms.candidate_id
      and p.user_id = auth.uid()
  ));

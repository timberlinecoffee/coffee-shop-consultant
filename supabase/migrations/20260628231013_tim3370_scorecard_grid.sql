-- TIM-3370: Interview scorecard grid — competencies × candidates with 1-5 scores + multipliers.
-- Adds 3 new tables and a legacy_notes column to interview_scorecards.

-- ── legacy_notes on interview_scorecards ──────────────────────────────────────
-- Preserve any existing free-text scorecard content (v1 window).

alter table public.interview_scorecards
  add column if not exists legacy_notes text;

-- ── scorecard_competencies ────────────────────────────────────────────────────
-- One row per column (competency / attribute / value) in the grid.

create table public.scorecard_competencies (
  id              uuid        primary key default gen_random_uuid(),
  scorecard_id    uuid        not null references public.interview_scorecards(id) on delete cascade,
  plan_id         uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  label           text        not null default '',
  multiplier      numeric(4,2) not null default 1.0,
  description     text,
  linked_question_ids uuid[]  not null default '{}',
  order_index     int         not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.scorecard_competencies (scorecard_id);
create index on public.scorecard_competencies (plan_id);

create trigger handle_scorecard_competencies_updated_at
  before update on public.scorecard_competencies
  for each row execute procedure public.handle_updated_at();

alter table public.scorecard_competencies enable row level security;

create policy "plan_owner_read_scorecard_competencies"
  on public.scorecard_competencies for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_scorecard_competencies"
  on public.scorecard_competencies for all
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ── scorecard_grid_candidates ─────────────────────────────────────────────────
-- One row per candidate (the row axis of the grid).
-- Separate from interview_candidates (pipeline tracking) — this is scorecard-scoped.

create table public.scorecard_grid_candidates (
  id              uuid        primary key default gen_random_uuid(),
  scorecard_id    uuid        not null references public.interview_scorecards(id) on delete cascade,
  plan_id         uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  name            text        not null default '',
  email           text,
  interviewed_at  date,
  interviewer     text,
  order_index     int         not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.scorecard_grid_candidates (scorecard_id);
create index on public.scorecard_grid_candidates (plan_id);

create trigger handle_scorecard_grid_candidates_updated_at
  before update on public.scorecard_grid_candidates
  for each row execute procedure public.handle_updated_at();

alter table public.scorecard_grid_candidates enable row level security;

create policy "plan_owner_read_scorecard_grid_candidates"
  on public.scorecard_grid_candidates for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_scorecard_grid_candidates"
  on public.scorecard_grid_candidates for all
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ── scorecard_cell_scores ─────────────────────────────────────────────────────
-- One row per (candidate × competency) cell — score 1-5 + optional notes.

create table public.scorecard_cell_scores (
  id              uuid        primary key default gen_random_uuid(),
  scorecard_id    uuid        not null references public.interview_scorecards(id) on delete cascade,
  candidate_id    uuid        not null references public.scorecard_grid_candidates(id) on delete cascade,
  competency_id   uuid        not null references public.scorecard_competencies(id) on delete cascade,
  plan_id         uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  score           smallint    check (score >= 1 and score <= 5),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (candidate_id, competency_id)
);

create index on public.scorecard_cell_scores (scorecard_id);
create index on public.scorecard_cell_scores (candidate_id);
create index on public.scorecard_cell_scores (competency_id);
create index on public.scorecard_cell_scores (plan_id);

create trigger handle_scorecard_cell_scores_updated_at
  before update on public.scorecard_cell_scores
  for each row execute procedure public.handle_updated_at();

alter table public.scorecard_cell_scores enable row level security;

create policy "plan_owner_read_scorecard_cell_scores"
  on public.scorecard_cell_scores for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_scorecard_cell_scores"
  on public.scorecard_cell_scores for all
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

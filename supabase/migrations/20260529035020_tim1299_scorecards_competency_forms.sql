-- TIM-1299: Per-role scorecards & competency form templates (W3 data model).
-- Adds interview_scorecards, competency_form_templates, wires new FKs, backfills.

-- ── interview_scorecards ──────────────────────────────────────────────────────

create table public.interview_scorecards (
  id          uuid        primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  role_id     uuid        references public.hiring_plan_roles(id) on delete cascade,
  name        text        not null default 'Default Scorecard',
  is_default  boolean     not null default false,
  order_index int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.interview_scorecards (plan_id, role_id);
create index on public.interview_scorecards (plan_id) where role_id is null;

create trigger handle_interview_scorecards_updated_at
  before update on public.interview_scorecards
  for each row execute procedure public.handle_updated_at();

alter table public.interview_scorecards enable row level security;

create policy "plan_owner_read_interview_scorecards"
  on public.interview_scorecards for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_interview_scorecards"
  on public.interview_scorecards for all
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

-- ── Add scorecard_id to interview_questions ───────────────────────────────────

alter table public.interview_questions
  add column scorecard_id uuid references public.interview_scorecards(id) on delete cascade;

create index on public.interview_questions (scorecard_id) where scorecard_id is not null;

-- ── Add scorecard_id to interview_scores (denormalized) ───────────────────────

alter table public.interview_scores
  add column scorecard_id uuid references public.interview_scorecards(id) on delete set null;

create index on public.interview_scores (scorecard_id) where scorecard_id is not null;

-- ── competency_form_templates ─────────────────────────────────────────────────

create table public.competency_form_templates (
  id          uuid        primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  role_id     uuid        references public.hiring_plan_roles(id) on delete cascade,
  name        text        not null default 'General',
  order_index int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.competency_form_templates (plan_id, role_id);
create index on public.competency_form_templates (plan_id) where role_id is null;

create trigger handle_competency_form_templates_updated_at
  before update on public.competency_form_templates
  for each row execute procedure public.handle_updated_at();

alter table public.competency_form_templates enable row level security;

create policy "plan_owner_read_competency_form_templates"
  on public.competency_form_templates for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_competency_form_templates"
  on public.competency_form_templates for all
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

-- ── Add form_template_id to staff_competencies ────────────────────────────────

alter table public.staff_competencies
  add column form_template_id uuid references public.competency_form_templates(id) on delete set null;

create index on public.staff_competencies (form_template_id) where form_template_id is not null;

-- ── Backfill: one default scorecard per role that has questions ───────────────

with role_question_plans as (
  select distinct plan_id, role_id
  from public.interview_questions
),
inserted as (
  insert into public.interview_scorecards (plan_id, role_id, name, is_default, order_index)
  select
    rqp.plan_id,
    rqp.role_id,
    case when rqp.role_id is null then 'Default Scorecard'
         else coalesce((select role_title from public.hiring_plan_roles where id = rqp.role_id), 'Default Scorecard')
    end || ' — Default',
    true,
    0
  from role_question_plans rqp
  returning id, plan_id, role_id
)
update public.interview_questions q
set scorecard_id = i.id
from inserted i
where q.plan_id = i.plan_id
  and (q.role_id = i.role_id or (q.role_id is null and i.role_id is null));

update public.interview_scores s
set scorecard_id = q.scorecard_id
from public.interview_questions q
where s.question_id = q.id
  and q.scorecard_id is not null;

-- ── Backfill: competency form templates per role from staff_competencies ──────

with comp_roles as (
  select distinct
    sc.plan_id,
    lower(trim(sc.required_for_role)) as norm_role,
    sc.required_for_role
  from public.staff_competencies sc
  where sc.required_for_role is not null and trim(sc.required_for_role) <> ''
),
matched as (
  select
    cr.plan_id,
    cr.norm_role,
    cr.required_for_role,
    r.id as role_id
  from comp_roles cr
  join public.hiring_plan_roles r
    on r.plan_id = cr.plan_id
   and lower(trim(r.role_title)) = cr.norm_role
),
inserted_role_templates as (
  insert into public.competency_form_templates (plan_id, role_id, name, order_index)
  select plan_id, role_id, 'General', 0
  from matched
  on conflict do nothing
  returning id, plan_id, role_id
)
update public.staff_competencies sc
set form_template_id = irt.id
from inserted_role_templates irt
join matched m on m.plan_id = irt.plan_id and m.role_id = irt.role_id
where sc.plan_id = m.plan_id
  and lower(trim(sc.required_for_role)) = m.norm_role;

with plans_needing_general as (
  select distinct sc.plan_id
  from public.staff_competencies sc
  where sc.form_template_id is null
),
inserted_general as (
  insert into public.competency_form_templates (plan_id, role_id, name, order_index)
  select plan_id, null, 'General', 0
  from plans_needing_general
  returning id, plan_id
)
update public.staff_competencies sc
set form_template_id = ig.id
from inserted_general ig
where sc.plan_id = ig.plan_id
  and sc.form_template_id is null;

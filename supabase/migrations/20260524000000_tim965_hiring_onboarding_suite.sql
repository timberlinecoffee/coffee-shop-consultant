-- TIM-965: Hiring & Onboarding Suite
-- New tables + extend hiring_plan_roles for org chart (parent_role_id) and JD link (jd_template_id).
-- Guardrail: NO payroll, NO benefits, NO PTO tables. monthly_cost_cents stays the only payroll-adjacent field.

-- ── Enums ─────────────────────────────────────────────────────────────────────

create type public.candidate_status as enum (
  'applied',
  'screening',
  'interviewing',
  'offered',
  'hired',
  'rejected'
);

create type public.onboarding_phase as enum (
  'day_1',
  'week_1',
  'month_1',
  'month_2',
  'month_3'
);

-- ── org_role_templates ────────────────────────────────────────────────────────
-- System-seeded coffee-shop role archetypes. Shared (no plan_id).

create table public.org_role_templates (
  id             uuid        primary key default gen_random_uuid(),
  role_title     text        not null,
  shop_size_tier text        not null default 'any',
  description    text,
  is_system      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger handle_org_role_templates_updated_at
  before update on public.org_role_templates
  for each row execute procedure public.handle_updated_at();

alter table public.org_role_templates enable row level security;

create policy "authenticated_read_org_role_templates"
  on public.org_role_templates
  for select
  to authenticated
  using (true);

-- ── job_description_templates ─────────────────────────────────────────────────
-- Null plan_id = system template. Per-plan rows are user copies.

create table public.job_description_templates (
  id                   uuid        primary key default gen_random_uuid(),
  plan_id              uuid        references public.coffee_shop_plans(id) on delete cascade,
  org_role_template_id uuid        references public.org_role_templates(id) on delete set null,
  title                text        not null,
  summary              text        not null default '',
  responsibilities     text        not null default '',
  requirements         text        not null default '',
  comp                 text        not null default '',
  is_system            boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on public.job_description_templates (plan_id) where plan_id is not null;
create index on public.job_description_templates (org_role_template_id) where org_role_template_id is not null;
create index on public.job_description_templates (is_system) where is_system = true;

create trigger handle_job_description_templates_updated_at
  before update on public.job_description_templates
  for each row execute procedure public.handle_updated_at();

alter table public.job_description_templates enable row level security;

create policy "authenticated_read_system_jd_templates"
  on public.job_description_templates
  for select
  to authenticated
  using (is_system = true);

create policy "plan_owner_read_jd_templates"
  on public.job_description_templates
  for select
  using (
    plan_id is not null
    and exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_jd_templates"
  on public.job_description_templates
  for all
  using (
    plan_id is not null
    and exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    plan_id is not null
    and exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ── Extend hiring_plan_roles ──────────────────────────────────────────────────

alter table public.hiring_plan_roles
  add column parent_role_id uuid references public.hiring_plan_roles(id) on delete set null,
  add column jd_template_id uuid references public.job_description_templates(id) on delete set null;

create index on public.hiring_plan_roles (parent_role_id) where parent_role_id is not null;
create index on public.hiring_plan_roles (jd_template_id) where jd_template_id is not null;

-- ── interview_candidates ──────────────────────────────────────────────────────

create table public.interview_candidates (
  id          uuid                    primary key default gen_random_uuid(),
  plan_id     uuid                    not null references public.coffee_shop_plans(id) on delete cascade,
  role_id     uuid                    references public.hiring_plan_roles(id) on delete set null,
  name        text                    not null,
  contact     text,
  status      public.candidate_status not null default 'applied',
  notes       text,
  position    int                     not null default 0,
  created_at  timestamptz             not null default now(),
  updated_at  timestamptz             not null default now()
);

create index on public.interview_candidates (plan_id, status);
create index on public.interview_candidates (role_id) where role_id is not null;

create trigger handle_interview_candidates_updated_at
  before update on public.interview_candidates
  for each row execute procedure public.handle_updated_at();

alter table public.interview_candidates enable row level security;

create policy "plan_owner_read_interview_candidates"
  on public.interview_candidates
  for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_interview_candidates"
  on public.interview_candidates
  for all
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

-- ── interview_questions ───────────────────────────────────────────────────────

create table public.interview_questions (
  id          uuid        primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  role_id     uuid        references public.hiring_plan_roles(id) on delete cascade,
  prompt      text        not null,
  weight      int         not null default 1 check (weight between 1 and 5),
  order_index int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.interview_questions (plan_id, role_id);

create trigger handle_interview_questions_updated_at
  before update on public.interview_questions
  for each row execute procedure public.handle_updated_at();

alter table public.interview_questions enable row level security;

create policy "plan_owner_read_interview_questions"
  on public.interview_questions
  for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_interview_questions"
  on public.interview_questions
  for all
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

-- ── interview_scores ──────────────────────────────────────────────────────────

create table public.interview_scores (
  id            uuid        primary key default gen_random_uuid(),
  candidate_id  uuid        not null references public.interview_candidates(id) on delete cascade,
  question_id   uuid        not null references public.interview_questions(id) on delete cascade,
  score         int         not null check (score between 1 and 5),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (candidate_id, question_id)
);

create index on public.interview_scores (candidate_id);

create trigger handle_interview_scores_updated_at
  before update on public.interview_scores
  for each row execute procedure public.handle_updated_at();

alter table public.interview_scores enable row level security;

create policy "plan_owner_read_interview_scores"
  on public.interview_scores
  for select
  using (
    exists (
      select 1
      from public.interview_candidates c
      join public.coffee_shop_plans p on p.id = c.plan_id
      where c.id = candidate_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_interview_scores"
  on public.interview_scores
  for all
  using (
    exists (
      select 1
      from public.interview_candidates c
      join public.coffee_shop_plans p on p.id = c.plan_id
      where c.id = candidate_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.interview_candidates c
      join public.coffee_shop_plans p on p.id = c.plan_id
      where c.id = candidate_id and p.user_id = auth.uid()
    )
  );

-- ── onboarding_plan_templates ─────────────────────────────────────────────────
-- System seed — role-scoped task templates per phase.

create table public.onboarding_plan_templates (
  id                   uuid                    primary key default gen_random_uuid(),
  org_role_template_id uuid                    references public.org_role_templates(id) on delete cascade,
  phase                public.onboarding_phase not null,
  task                 text                    not null,
  order_index          int                     not null default 0,
  is_system            boolean                 not null default true,
  created_at           timestamptz             not null default now()
);

create index on public.onboarding_plan_templates (org_role_template_id, phase);

alter table public.onboarding_plan_templates enable row level security;

create policy "authenticated_read_onboarding_plan_templates"
  on public.onboarding_plan_templates
  for select
  to authenticated
  using (true);

-- ── onboarding_plan_instances ─────────────────────────────────────────────────

create table public.onboarding_plan_instances (
  id           uuid        primary key default gen_random_uuid(),
  plan_id      uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  candidate_id uuid        references public.interview_candidates(id) on delete set null,
  role_id      uuid        references public.hiring_plan_roles(id) on delete set null,
  hire_name    text        not null,
  start_date   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.onboarding_plan_instances (plan_id);

create trigger handle_onboarding_plan_instances_updated_at
  before update on public.onboarding_plan_instances
  for each row execute procedure public.handle_updated_at();

alter table public.onboarding_plan_instances enable row level security;

create policy "plan_owner_read_onboarding_plan_instances"
  on public.onboarding_plan_instances
  for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_onboarding_plan_instances"
  on public.onboarding_plan_instances
  for all
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

-- ── onboarding_tasks ──────────────────────────────────────────────────────────

create table public.onboarding_tasks (
  id              uuid                    primary key default gen_random_uuid(),
  instance_id     uuid                    not null references public.onboarding_plan_instances(id) on delete cascade,
  phase           public.onboarding_phase not null,
  task            text                    not null,
  due_offset_days int,
  completed_at    timestamptz,
  notes           text,
  order_index     int                     not null default 0,
  created_at      timestamptz             not null default now(),
  updated_at      timestamptz             not null default now()
);

create index on public.onboarding_tasks (instance_id, phase);

create trigger handle_onboarding_tasks_updated_at
  before update on public.onboarding_tasks
  for each row execute procedure public.handle_updated_at();

alter table public.onboarding_tasks enable row level security;

create policy "plan_owner_read_onboarding_tasks"
  on public.onboarding_tasks
  for select
  using (
    exists (
      select 1
      from public.onboarding_plan_instances i
      join public.coffee_shop_plans p on p.id = i.plan_id
      where i.id = instance_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_onboarding_tasks"
  on public.onboarding_tasks
  for all
  using (
    exists (
      select 1
      from public.onboarding_plan_instances i
      join public.coffee_shop_plans p on p.id = i.plan_id
      where i.id = instance_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.onboarding_plan_instances i
      join public.coffee_shop_plans p on p.id = i.plan_id
      where i.id = instance_id and p.user_id = auth.uid()
    )
  );

-- ── staff_competencies ────────────────────────────────────────────────────────

create table public.staff_competencies (
  id                uuid        primary key default gen_random_uuid(),
  plan_id           uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  skill             text        not null,
  rubric            text        not null default '',
  required_for_role text,
  weight            int         not null default 1 check (weight between 1 and 5),
  order_index       int         not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on public.staff_competencies (plan_id, order_index);

create trigger handle_staff_competencies_updated_at
  before update on public.staff_competencies
  for each row execute procedure public.handle_updated_at();

alter table public.staff_competencies enable row level security;

create policy "plan_owner_read_staff_competencies"
  on public.staff_competencies
  for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_staff_competencies"
  on public.staff_competencies
  for all
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

-- ── staff_files ───────────────────────────────────────────────────────────────

create table public.staff_files (
  id          uuid        primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  name        text        not null,
  hire_date   date,
  role_id     uuid        references public.hiring_plan_roles(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.staff_files (plan_id);

create trigger handle_staff_files_updated_at
  before update on public.staff_files
  for each row execute procedure public.handle_updated_at();

alter table public.staff_files enable row level security;

create policy "plan_owner_read_staff_files"
  on public.staff_files
  for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_staff_files"
  on public.staff_files
  for all
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

-- ── competency_evaluations ────────────────────────────────────────────────────

create table public.competency_evaluations (
  id              uuid        primary key default gen_random_uuid(),
  staff_file_id   uuid        not null references public.staff_files(id) on delete cascade,
  competency_id   uuid        not null references public.staff_competencies(id) on delete cascade,
  score           int         not null check (score between 1 and 5),
  notes           text,
  evaluated_at    date        not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (staff_file_id, competency_id)
);

create index on public.competency_evaluations (staff_file_id);

create trigger handle_competency_evaluations_updated_at
  before update on public.competency_evaluations
  for each row execute procedure public.handle_updated_at();

alter table public.competency_evaluations enable row level security;

create policy "plan_owner_read_competency_evaluations"
  on public.competency_evaluations
  for select
  using (
    exists (
      select 1
      from public.staff_files sf
      join public.coffee_shop_plans p on p.id = sf.plan_id
      where sf.id = staff_file_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_competency_evaluations"
  on public.competency_evaluations
  for all
  using (
    exists (
      select 1
      from public.staff_files sf
      join public.coffee_shop_plans p on p.id = sf.plan_id
      where sf.id = staff_file_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.staff_files sf
      join public.coffee_shop_plans p on p.id = sf.plan_id
      where sf.id = staff_file_id and p.user_id = auth.uid()
    )
  );

-- ── Seed: org_role_templates ──────────────────────────────────────────────────

insert into public.org_role_templates (role_title, shop_size_tier, description) values
  ('Barista',           'any',    'Customer-facing coffee preparation and hospitality'),
  ('Shift Lead',        'any',    'Supervises shift operations and team during a specific service window'),
  ('Assistant Manager', 'medium', 'Supports the owner with daily operations, scheduling, and training'),
  ('Owner-Operator',    'any',    'Owns and runs the business — strategy, finances, culture, and community'),
  ('Head Roaster',      'large',  'Leads sourcing, roasting, and quality control for in-house roasting programs');

-- ── Seed: job_description_templates (system) ──────────────────────────────────

insert into public.job_description_templates
  (plan_id, org_role_template_id, title, summary, responsibilities, requirements, comp, is_system)
select
  null,
  ort.id,
  ort.role_title || ' — Job Description',
  case ort.role_title
    when 'Barista' then
      'We are looking for a passionate barista to join our team. You will craft exceptional coffee beverages, deliver warm hospitality, and uphold our quality standards on every shift.'
    when 'Shift Lead' then
      'The Shift Lead keeps our shop running smoothly during their service window — from opening tasks to team support to closing clean-up. You are the go-to person when the manager is not on the floor.'
    when 'Assistant Manager' then
      'The Assistant Manager partners with the owner to run day-to-day operations, manage schedules, train new hires, and ensure a consistent guest experience.'
    when 'Owner-Operator' then
      'As owner-operator you set the vision, culture, and standards for the entire shop. You are responsible for financial performance, team development, vendor relationships, and community presence.'
    when 'Head Roaster' then
      'The Head Roaster leads our in-house roasting program — from green coffee sourcing through quality control. You develop roast profiles, train the team on brew standards, and maintain equipment.'
    else ''
  end,
  case ort.role_title
    when 'Barista' then
      '- Pull consistent espresso shots and steam milk to standard
- Greet and serve every guest with genuine hospitality
- Maintain a clean, organized bar throughout the shift
- Follow recipes and portion standards precisely
- Support opening, mid-shift, and closing duties as assigned'
    when 'Shift Lead' then
      '- Open or close the shop following established checklists
- Supervise and coach baristas on shift
- Handle guest recovery situations calmly and professionally
- Manage cash drawer and end-of-shift reporting
- Communicate shift notes to incoming team and management'
    when 'Assistant Manager' then
      '- Build and publish weekly schedules
- Onboard and train new team members
- Conduct regular inventory counts and place orders
- Resolve customer escalations and coach team on service recovery
- Support the owner with vendor communication and daily P&L review'
    when 'Owner-Operator' then
      '- Define and uphold the shop''s brand, culture, and service standards
- Oversee all financial reporting and budgeting
- Hire, onboard, and develop the full team
- Build community partnerships and local marketing initiatives
- Manage lease, vendor, and licensing relationships'
    when 'Head Roaster' then
      '- Source, sample, and select green coffees with target cup profiles
- Develop and document roast profiles for all offerings
- Roast to weekly demand and maintain inventory
- Train baristas on brew standards and sensory skills
- Maintain all roasting and QC equipment'
    else ''
  end,
  case ort.role_title
    when 'Barista' then
      '- Genuine passion for coffee and guest service
- Ability to stand for extended periods and lift up to 30 lbs
- Reliable availability including weekends and early mornings
- Previous cafe or food-service experience a plus, not required'
    when 'Shift Lead' then
      '- 1+ year barista or food-service experience
- Demonstrated ability to lead a small team
- Strong communication and conflict-resolution skills
- Basic cash-handling experience'
    when 'Assistant Manager' then
      '- 2+ years in a supervisory food-service role
- Proficiency in scheduling tools and Google Workspace
- Strong organizational and follow-through skills
- ServSafe certification preferred'
    when 'Owner-Operator' then
      '- Entrepreneurial mindset with proven business management experience
- Financial literacy: P&L, cash flow, basic accounting
- Deep commitment to the specialty coffee community
- Ability to work across all roles in the shop as needed'
    when 'Head Roaster' then
      '- 3+ years of production roasting experience in specialty coffee
- Q Grader or equivalent sensory training preferred
- Familiarity with roast profiling software (Cropster, Artisan, or similar)
- Strong attention to detail and documentation habits'
    else ''
  end,
  case ort.role_title
    when 'Barista'           then 'Competitive hourly rate with tips. Path to Shift Lead.'
    when 'Shift Lead'        then 'Hourly above barista base. Tips included. Path to Assistant Manager.'
    when 'Assistant Manager' then 'Salaried or hourly DOE. Benefits discussion after 90-day review.'
    when 'Owner-Operator'    then 'Owner compensation tied to business performance and structure.'
    when 'Head Roaster'      then 'Salaried DOE. Includes continuing education budget.'
    else ''
  end,
  true
from public.org_role_templates ort;

-- ── Seed: onboarding_plan_templates (universal day-1 tasks) ──────────────────

insert into public.onboarding_plan_templates (org_role_template_id, phase, task, order_index)
select
  ort.id,
  'day_1'::public.onboarding_phase,
  t.task,
  t.ord
from public.org_role_templates ort
cross join (values
  ('Complete new-hire paperwork and I-9 verification', 0),
  ('Tour the shop: equipment, storage, POS, emergency exits', 1),
  ('Meet the full team; receive schedule and communication norms', 2),
  ('Review brand story, mission, and service standards', 3),
  ('Shadow an experienced team member for a full shift', 4)
) as t(task, ord);

insert into public.onboarding_plan_templates (org_role_template_id, phase, task, order_index)
select
  ort.id,
  'week_1'::public.onboarding_phase,
  t.task,
  t.ord
from public.org_role_templates ort
cross join (values
  ('Complete bar certification: espresso, milk steaming, and pour-over', 0),
  ('Pass POS and cash-handling training', 1),
  ('Learn opening and closing checklists', 2),
  ('Memorize current menu and seasonal offerings', 3),
  ('First assessed solo shift with supervisor check-in', 4)
) as t(task, ord);

insert into public.onboarding_plan_templates (org_role_template_id, phase, task, order_index)
select
  ort.id,
  'month_1'::public.onboarding_phase,
  t.task,
  t.ord
from public.org_role_templates ort
cross join (values
  ('30-day performance check-in with manager', 0),
  ('Demonstrate consistent standards without prompting', 1),
  ('Complete food-safety certification if not already held', 2)
) as t(task, ord);

insert into public.onboarding_plan_templates (org_role_template_id, phase, task, order_index)
select
  ort.id,
  'month_2'::public.onboarding_phase,
  t.task,
  t.ord
from public.org_role_templates ort
cross join (values
  ('60-day performance review and goal-setting session', 0),
  ('Lead one training session for a newer team member', 1)
) as t(task, ord);

insert into public.onboarding_plan_templates (org_role_template_id, phase, task, order_index)
select
  ort.id,
  'month_3'::public.onboarding_phase,
  t.task,
  t.ord
from public.org_role_templates ort
cross join (values
  ('90-day competency evaluation', 0),
  ('Career development conversation with owner or manager', 1)
) as t(task, ord);

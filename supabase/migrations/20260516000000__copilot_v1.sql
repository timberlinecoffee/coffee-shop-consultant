-- TIM-629 / TIM-618-A: Co-pilot v1 schema migration
-- Adds workspace_documents, evolves ai_conversations, adds ai_errors.

-- ── workspace_documents ──────────────────────────────────────────────────────

create table public.workspace_documents (
  id          uuid        primary key default gen_random_uuid(),
  plan_id     uuid        not null references public.coffee_shop_plans(id) on delete cascade,
  workspace_key text      not null check (workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  )),
  content     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (plan_id, workspace_key)
);

alter table public.workspace_documents enable row level security;

-- Plan-owner read
create policy "plan_owner_read_workspace_documents"
  on public.workspace_documents
  for select
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

-- Plan-owner write (insert/update/delete)
create policy "plan_owner_write_workspace_documents"
  on public.workspace_documents
  for all
  using (
    exists (
      select 1
      from public.coffee_shop_plans p
      where p.id = plan_id
        and p.user_id = auth.uid()
    )
  );

-- updated_at trigger
create trigger handle_workspace_documents_updated_at
  before update on public.workspace_documents
  for each row execute procedure public.handle_updated_at();

-- ── ai_conversations evolution ────────────────────────────────────────────────

alter table public.ai_conversations
  add column if not exists workspace_key   text,
  add column if not exists thread_id       uuid        default gen_random_uuid(),
  add column if not exists title           text,
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists model_used      text;

-- Backfill workspace_key from section_key where a direct mapping exists.
-- Only handles the known legacy section_key patterns; unrecognised values stay NULL.
update public.ai_conversations set workspace_key =
  case
    when section_key ilike '%concept%'           then 'concept'
    when section_key ilike '%location%'
      or section_key ilike '%lease%'             then 'location_lease'
    when section_key ilike '%financ%'            then 'financials'
    when section_key ilike '%menu%'
      or section_key ilike '%pric%'              then 'menu_pricing'
    when section_key ilike '%build%'
      or section_key ilike '%equipment%'         then 'buildout_equipment'
    when section_key ilike '%launch%'            then 'launch_plan'
    else null
  end
where workspace_key is null;

-- workspace_key constraint (nullable during W1 cutover — TIM-618-H enforces NOT NULL)
alter table public.ai_conversations
  add constraint ai_conversations_workspace_key_check
  check (
    workspace_key is null or workspace_key in (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan'
    )
  );

-- Existing plan-owner RLS policy already covers ai_conversations (created in schema.sql).
-- The new columns are covered by the existing all-operation policy.

-- ── ai_errors ─────────────────────────────────────────────────────────────────

create table public.ai_errors (
  id              bigserial   primary key,
  user_id         uuid        references public.users(id) on delete set null,
  workspace_key   text        check (workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  )),
  error_code      text        not null,
  upstream_status integer,
  request_id      text,
  details         jsonb,
  created_at      timestamptz not null default now()
);

alter table public.ai_errors enable row level security;

-- Service role can insert (service role bypasses RLS by default in Supabase, but
-- be explicit so future policy audits are clear).
create policy "service_role_write_ai_errors"
  on public.ai_errors
  for all
  to service_role
  using (true)
  with check (true);

-- Users can read their own error rows
create policy "own_row_read_ai_errors"
  on public.ai_errors
  for select
  using (auth.uid() = user_id);

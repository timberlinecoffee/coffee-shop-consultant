-- TIM-1040: Launch Plan workspace — milestone tracking table.
-- Stores milestones with backward-scheduled dates, track grouping, AI notes,
-- and uses workspace_documents for target launch date + regeneration tracking.

create table if not exists public.launch_milestones (
  id                      uuid primary key default gen_random_uuid(),
  plan_id                 uuid not null references public.coffee_shop_plans(id) on delete cascade,
  title                   text not null,
  description             text,
  track                   text not null check (track in (
                            'legal_compliance',
                            'real_estate_buildout',
                            'equipment',
                            'brand_marketing',
                            'menu_operations',
                            'people_hiring',
                            'finance_admin',
                            'pre_launch_events',
                            'post_launch'
                          )),
  target_date             date,
  actual_date             date,
  status                  text not null default 'not_started' check (status in (
                            'not_started', 'in_progress', 'blocked', 'done'
                          )),
  estimated_duration_days integer,
  depends_on_milestone_ids uuid[] not null default '{}',
  critical_path           boolean not null default false,
  owner                   text not null default 'founder',
  ai_notes                text,
  user_edited             boolean not null default false,
  source                  text not null default 'user_added' check (source in ('ai_generated', 'user_added')),
  order_index             integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists launch_milestones_plan_id_idx on public.launch_milestones (plan_id);
create index if not exists launch_milestones_plan_track_idx on public.launch_milestones (plan_id, track);

alter table public.launch_milestones enable row level security;

create policy "launch_milestones_select" on public.launch_milestones
  for select using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "launch_milestones_insert" on public.launch_milestones
  for insert with check (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "launch_milestones_update" on public.launch_milestones
  for update using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "launch_milestones_delete" on public.launch_milestones
  for delete using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create or replace function public.fn_launch_milestones_updated_at()
returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_launch_milestones_updated_at on public.launch_milestones;
create trigger trg_launch_milestones_updated_at
  before update on public.launch_milestones
  for each row execute function public.fn_launch_milestones_updated_at();

-- TIM-3018: Per-section draft storage for regenerate-all durability.
-- Holds generated-but-not-yet-accepted section content per run, so a Lambda
-- kill mid-stream preserves completed sections without mutating the live
-- business_plan_sections.user_content column (Shape C invariant from TIM-2924).

create table if not exists public.business_plan_section_drafts (
  id                            uuid primary key default gen_random_uuid(),
  plan_id                       uuid not null references public.coffee_shop_plans(id) on delete cascade,
  run_id                        uuid not null,
  section_key                   text not null,
  draft_content                 text not null,
  source_markers_json           jsonb,
  estimated_claims_json         jsonb,
  canon_substitutions_json      jsonb,
  consistency_contradictions_json jsonb,
  status                        text not null default 'pending',
  resolved_at                   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint business_plan_section_drafts_status_check
    check (status in ('pending', 'accepted', 'rejected')),
  constraint business_plan_section_drafts_run_section_unique
    unique (run_id, section_key)
);

create index if not exists business_plan_section_drafts_plan_pending_idx
  on public.business_plan_section_drafts (plan_id, status, created_at desc)
  where status = 'pending';

create index if not exists business_plan_section_drafts_run_idx
  on public.business_plan_section_drafts (run_id);

-- Rule 1: RLS enabled + deny-by-default + plan-ownership policies.
alter table public.business_plan_section_drafts enable row level security;

revoke all on public.business_plan_section_drafts from anon;
revoke all on public.business_plan_section_drafts from authenticated;
grant select, insert, update, delete on public.business_plan_section_drafts to authenticated;

create policy "bp_section_drafts_select" on public.business_plan_section_drafts
  for select using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "bp_section_drafts_insert" on public.business_plan_section_drafts
  for insert with check (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "bp_section_drafts_update" on public.business_plan_section_drafts
  for update using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create policy "bp_section_drafts_delete" on public.business_plan_section_drafts
  for delete using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

-- updated_at trigger (mirrors business_plan_sections pattern).
create or replace function public.update_business_plan_section_drafts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger business_plan_section_drafts_updated_at
  before update on public.business_plan_section_drafts
  for each row execute function public.update_business_plan_section_drafts_updated_at();

-- TIM-627: rename module_responses -> workspace_responses; module_number -> workspace_key.
-- Staging data only; no production rows. Coordinate with TIM-618 plan-aware AI co-pilot
-- schema: AI conversations + workspace responses share the workspace_key axis.

begin;

alter table public.module_responses rename to workspace_responses;

alter table public.workspace_responses
  drop constraint if exists module_responses_module_number_check;

alter table public.workspace_responses
  rename column module_number to workspace_key;

alter table public.workspace_responses
  alter column workspace_key type text using workspace_key::text;

alter table public.workspace_responses
  add constraint workspace_responses_workspace_key_check
  check (workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  ));

alter table public.workspace_responses
  drop constraint if exists module_responses_plan_id_module_number_section_key_key;

alter table public.workspace_responses
  add constraint workspace_responses_plan_id_workspace_key_section_key_key
  unique (plan_id, workspace_key, section_key);

drop policy if exists "Users can manage own module responses" on public.workspace_responses;

create policy "Users can manage own workspace responses" on public.workspace_responses for all
  using (
    auth.uid() = (select user_id from public.coffee_shop_plans where id = plan_id)
  )
  with check (
    auth.uid() = (select user_id from public.coffee_shop_plans where id = plan_id)
  );

drop trigger if exists handle_module_responses_updated_at on public.workspace_responses;

create trigger handle_workspace_responses_updated_at
  before update on public.workspace_responses
  for each row execute procedure public.handle_updated_at();

commit;

-- Rollback:
--   alter table public.workspace_responses rename to module_responses;
--   (manual column rename + check + unique + policy restore)

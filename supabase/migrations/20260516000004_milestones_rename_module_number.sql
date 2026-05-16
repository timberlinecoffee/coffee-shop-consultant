-- TIM-627: milestones.module_number -> source_workspace_key (text, nullable).
-- Milestones can originate from any workspace (or none).

begin;

alter table public.milestones
  drop constraint if exists milestones_module_number_check;

alter table public.milestones
  rename column module_number to source_workspace_key;

alter table public.milestones
  alter column source_workspace_key type text using source_workspace_key::text;

alter table public.milestones
  add constraint milestones_source_workspace_key_check
  check (source_workspace_key is null or source_workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  ));

commit;

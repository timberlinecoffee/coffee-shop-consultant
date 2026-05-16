-- TIM-627: ai_conversations.module_number -> workspace_key.
-- Pairs with workspace_responses migration; the plan-aware AI co-pilot
-- (TIM-618) reads both tables on the same workspace_key axis.

begin;

alter table public.ai_conversations
  drop constraint if exists ai_conversations_module_number_check;

alter table public.ai_conversations
  rename column module_number to workspace_key;

alter table public.ai_conversations
  alter column workspace_key type text using workspace_key::text;

alter table public.ai_conversations
  add constraint ai_conversations_workspace_key_check
  check (workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  ));

commit;

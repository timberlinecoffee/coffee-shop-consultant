-- TIM-1061: Allow 'operations_playbook' as a workspace_key for the
-- Operations Playbook (SOPs) workspace. The document body lives in
-- workspace_documents.content jsonb; the SOP categories are six fixed
-- sub-keys inside the jsonb so no new tables are required.
--
-- Three check constraints reference workspace_key and must be updated in
-- lockstep: workspace_documents, ai_conversations, and ai_errors. The
-- original definitions are in 20260516000000__copilot_v1.sql.

-- ── workspace_documents ──────────────────────────────────────────────────────
alter table public.workspace_documents
  drop constraint if exists workspace_documents_workspace_key_check;

alter table public.workspace_documents
  add constraint workspace_documents_workspace_key_check
  check (workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'operations_playbook'
  ));

-- ── ai_conversations ─────────────────────────────────────────────────────────
alter table public.ai_conversations
  drop constraint if exists ai_conversations_workspace_key_check;

alter table public.ai_conversations
  add constraint ai_conversations_workspace_key_check
  check (
    workspace_key is null or workspace_key in (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'operations_playbook'
    )
  );

-- ── ai_errors ────────────────────────────────────────────────────────────────
alter table public.ai_errors
  drop constraint if exists ai_errors_workspace_key_check;

alter table public.ai_errors
  add constraint ai_errors_workspace_key_check
  check (workspace_key is null or workspace_key in (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'operations_playbook'
  ));

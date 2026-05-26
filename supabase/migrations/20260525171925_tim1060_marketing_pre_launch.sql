-- TIM-1060: Marketing & Pre-Launch workspace.
-- Adds 'marketing_pre_launch' to the workspace_key allow-list on every table
-- that stores a workspace_key text column with a CHECK constraint.
--
-- Data lives in workspace_documents.content as a single JSONB document with
-- sections: waitlist, gbp, social, opening_promo, press. No new table needed.

ALTER TABLE public.workspace_documents
  DROP CONSTRAINT IF EXISTS workspace_documents_workspace_key_check,
  ADD CONSTRAINT workspace_documents_workspace_key_check
    CHECK (workspace_key IN (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'marketing_pre_launch'
    ));

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_workspace_key_check,
  ADD CONSTRAINT ai_conversations_workspace_key_check
    CHECK (workspace_key IS NULL OR workspace_key IN (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'marketing_pre_launch'
    ));

ALTER TABLE public.ai_errors
  DROP CONSTRAINT IF EXISTS ai_errors_workspace_key_check,
  ADD CONSTRAINT ai_errors_workspace_key_check
    CHECK (workspace_key IN (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'marketing_pre_launch'
    ));

ALTER TABLE public.workspace_responses
  DROP CONSTRAINT IF EXISTS workspace_responses_workspace_key_check,
  ADD CONSTRAINT workspace_responses_workspace_key_check
    CHECK (workspace_key IN (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'marketing_pre_launch'
    ));

ALTER TABLE public.milestones
  DROP CONSTRAINT IF EXISTS milestones_source_workspace_key_check,
  ADD CONSTRAINT milestones_source_workspace_key_check
    CHECK (source_workspace_key IS NULL OR source_workspace_key IN (
      'concept',
      'location_lease',
      'financials',
      'menu_pricing',
      'buildout_equipment',
      'launch_plan',
      'marketing_pre_launch'
    ));

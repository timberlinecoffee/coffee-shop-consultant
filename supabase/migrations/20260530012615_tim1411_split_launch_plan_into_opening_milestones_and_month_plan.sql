-- TIM-1411: Split the legacy "launch_plan" workspace_key into two suites —
--   * "opening_milestones" (dated gating milestones)
--   * "opening_month_plan"  (tactical week-by-week playbook)
-- across every check constraint that enumerates workspace_key. Migrates any
-- existing rows that referenced 'launch_plan' to 'opening_milestones' by
-- default (the issue's documented rule for ambiguous content), then drops
-- 'launch_plan' from each allow-list so the new schema is the only valid one.

-- ── 1. Drop the existing check constraints so the UPDATEs below succeed.
ALTER TABLE public.workspace_documents
  DROP CONSTRAINT IF EXISTS workspace_documents_workspace_key_check;
ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_workspace_key_check;
ALTER TABLE public.ai_errors
  DROP CONSTRAINT IF EXISTS ai_errors_workspace_key_check;
ALTER TABLE public.workspace_responses
  DROP CONSTRAINT IF EXISTS workspace_responses_workspace_key_check;
ALTER TABLE public.milestones
  DROP CONSTRAINT IF EXISTS milestones_source_workspace_key_check;

-- ── 2. Migrate existing rows. Default ambiguous content to opening_milestones
--      per the TIM-1411 description (board flags exceptions on review).
UPDATE public.workspace_documents
   SET workspace_key = 'opening_milestones'
 WHERE workspace_key = 'launch_plan';

UPDATE public.workspace_responses
   SET workspace_key = 'opening_milestones'
 WHERE workspace_key = 'launch_plan';

UPDATE public.ai_conversations
   SET workspace_key = 'opening_milestones'
 WHERE workspace_key = 'launch_plan';

UPDATE public.ai_errors
   SET workspace_key = 'opening_milestones'
 WHERE workspace_key = 'launch_plan';

UPDATE public.milestones
   SET source_workspace_key = 'opening_milestones'
 WHERE source_workspace_key = 'launch_plan';

UPDATE public.workspace_status
   SET component_key = 'opening_milestones'
 WHERE component_key = 'launch_plan';

-- ── 3. Re-create the constraints with the new allow-lists.
ALTER TABLE public.workspace_documents
  ADD CONSTRAINT workspace_documents_workspace_key_check
  CHECK (workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'opening_milestones',
    'opening_month_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_workspace_key_check
  CHECK (workspace_key IS NULL OR workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'opening_milestones',
    'opening_month_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.ai_errors
  ADD CONSTRAINT ai_errors_workspace_key_check
  CHECK (workspace_key IS NULL OR workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'opening_milestones',
    'opening_month_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.workspace_responses
  ADD CONSTRAINT workspace_responses_workspace_key_check
  CHECK (workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'opening_milestones',
    'opening_month_plan'
  ));

ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_source_workspace_key_check
  CHECK (source_workspace_key IS NULL OR source_workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'opening_milestones',
    'opening_month_plan',
    'marketing'
  ));

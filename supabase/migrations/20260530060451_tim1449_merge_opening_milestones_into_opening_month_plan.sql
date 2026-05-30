-- TIM-1449: Merge the short-lived TIM-1411 split (Opening Milestones +
-- Opening Month Plan) back into a single 'opening_month_plan' workspace.
-- Founder reversed the TIM-1411 call after reviewing the rendered split.
-- This migration:
--   1. drops the workspace_key check constraints on every table that
--      enumerates them,
--   2. resolves the conflict where a plan already has BOTH the old
--      'opening_milestones' row (with meaningful state) AND the empty
--      'opening_month_plan' row created by the TIM-1411 split. The empty
--      row gets dropped; the milestones row gets renamed forward,
--   3. migrates remaining 'opening_milestones' rows to 'opening_month_plan'
--      so no content is orphaned,
--   4. re-creates the constraints with 'opening_milestones' removed.

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

-- Resolve (plan_id, key) conflicts before the rename: where a plan has
-- BOTH the legacy opening_milestones row and a never-touched
-- opening_month_plan row (left over from the TIM-1411 split), drop the
-- opening_month_plan row so the meaningful opening_milestones row can
-- rename forward without violating the unique key.

DELETE FROM public.workspace_status
 WHERE component_key = 'opening_month_plan'
   AND plan_id IN (
     SELECT plan_id
       FROM public.workspace_status
      WHERE component_key = 'opening_milestones'
   );

DELETE FROM public.workspace_documents
 WHERE workspace_key = 'opening_month_plan'
   AND plan_id IN (
     SELECT plan_id
       FROM public.workspace_documents
      WHERE workspace_key = 'opening_milestones'
   );

UPDATE public.workspace_documents
   SET workspace_key = 'opening_month_plan'
 WHERE workspace_key = 'opening_milestones';

UPDATE public.workspace_responses
   SET workspace_key = 'opening_month_plan'
 WHERE workspace_key = 'opening_milestones';

UPDATE public.ai_conversations
   SET workspace_key = 'opening_month_plan'
 WHERE workspace_key = 'opening_milestones';

UPDATE public.ai_errors
   SET workspace_key = 'opening_month_plan'
 WHERE workspace_key = 'opening_milestones';

UPDATE public.milestones
   SET source_workspace_key = 'opening_month_plan'
 WHERE source_workspace_key = 'opening_milestones';

UPDATE public.workspace_status
   SET component_key = 'opening_month_plan'
 WHERE component_key = 'opening_milestones';

ALTER TABLE public.workspace_documents
  ADD CONSTRAINT workspace_documents_workspace_key_check
  CHECK (workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
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
    'opening_month_plan',
    'marketing'
  ));

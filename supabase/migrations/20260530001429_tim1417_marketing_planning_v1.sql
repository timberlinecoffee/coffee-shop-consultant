-- TIM-1417: Collapse Marketing Suite (V2 execution tooling) and Marketing & Pre-Launch into a
-- single Marketing planning surface. Owner-written planning document only — no content
-- calendar, posting, campaigns, or budget execution. Data lives in
-- workspace_documents.content jsonb under workspace_key='marketing' with four sections:
-- overview, channels, story, pre_launch.
--
-- Steps:
--   1. Add 'marketing' to workspace_key allow-lists on workspace_documents,
--      ai_conversations, ai_errors. Drop 'marketing_pre_launch' from those lists
--      (already absent on workspace_documents/ai_conversations/ai_errors after TIM-1061).
--   2. Drop the marketing execution tables introduced by TIM-1036 (brand,
--      digital_presence, content_posts, campaigns, budget_lines). No live owner data —
--      only auto-seeded system rows.
--   3. Remove 'marketing_pre_launch' from workspace_responses and milestones key checks.

-- ── 1. workspace_key allow-lists ─────────────────────────────────────────────

ALTER TABLE public.workspace_documents
  DROP CONSTRAINT IF EXISTS workspace_documents_workspace_key_check;

ALTER TABLE public.workspace_documents
  ADD CONSTRAINT workspace_documents_workspace_key_check
  CHECK (workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_workspace_key_check;

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_workspace_key_check
  CHECK (workspace_key IS NULL OR workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.ai_errors
  DROP CONSTRAINT IF EXISTS ai_errors_workspace_key_check;

ALTER TABLE public.ai_errors
  ADD CONSTRAINT ai_errors_workspace_key_check
  CHECK (workspace_key IS NULL OR workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'operations_playbook',
    'marketing'
  ));

ALTER TABLE public.workspace_responses
  DROP CONSTRAINT IF EXISTS workspace_responses_workspace_key_check;

ALTER TABLE public.workspace_responses
  ADD CONSTRAINT workspace_responses_workspace_key_check
  CHECK (workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan'
  ));

ALTER TABLE public.milestones
  DROP CONSTRAINT IF EXISTS milestones_source_workspace_key_check;

ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_source_workspace_key_check
  CHECK (source_workspace_key IS NULL OR source_workspace_key IN (
    'concept',
    'location_lease',
    'financials',
    'menu_pricing',
    'buildout_equipment',
    'launch_plan',
    'marketing'
  ));

-- Any milestones rows that reference the deprecated 'marketing_pre_launch' key
-- need their source_workspace_key reset before the new constraint applies. None
-- expected today, but make the migration idempotent.
UPDATE public.milestones
SET source_workspace_key = NULL
WHERE source_workspace_key = 'marketing_pre_launch';

-- ── 2. Drop the V2 execution tables ──────────────────────────────────────────

DROP TABLE IF EXISTS public.marketing_brand              CASCADE;
DROP TABLE IF EXISTS public.marketing_digital_presence   CASCADE;
DROP TABLE IF EXISTS public.marketing_content_posts      CASCADE;
DROP TABLE IF EXISTS public.marketing_campaigns          CASCADE;
DROP TABLE IF EXISTS public.marketing_budget_lines       CASCADE;

-- Drop the marketing_pre_launch workspace_documents rows (workspace_key was removed
-- from the check constraint by TIM-1061, so any survivors would already be invalid).
DELETE FROM public.workspace_documents WHERE workspace_key = 'marketing_pre_launch';
DELETE FROM public.ai_conversations    WHERE workspace_key = 'marketing_pre_launch';
DELETE FROM public.ai_errors           WHERE workspace_key = 'marketing_pre_launch';
DELETE FROM public.workspace_responses WHERE workspace_key = 'marketing_pre_launch';

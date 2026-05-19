-- TIM-639 / TIM-618-H: Drop ai_conversations.module_number and ai_conversations.section_key.
-- Co-pilot moved to (plan_id, workspace_key, thread_id) in TIM-629 / TIM-618-A.
-- /api/coach (the only consumer) is deleted in this same change set;
-- /api/copilot/stream stopped writing the bridge values, so the columns are unused.

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_module_number_check;

ALTER TABLE public.ai_conversations
  DROP COLUMN IF EXISTS module_number,
  DROP COLUMN IF EXISTS section_key;

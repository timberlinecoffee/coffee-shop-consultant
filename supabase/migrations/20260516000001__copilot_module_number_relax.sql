-- TIM-631 / TIM-618-B: Allow module_number = 0 for workspace-keyed co-pilot conversations.
-- The legacy 1–8 range check blocked inserts from the new /api/copilot/stream route.
-- TIM-618-H will drop module_number and section_key entirely once /api/coach is retired.

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_module_number_check;

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_module_number_check
  CHECK (module_number = 0 OR (module_number BETWEEN 1 AND 8));

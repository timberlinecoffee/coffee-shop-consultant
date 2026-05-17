-- TIM-627 #2 adapted: ai_conversations already has workspace_key (added in copilot_v1).
-- Drop the now-vestigial module_number column and its check constraint.
begin;
alter table public.ai_conversations drop constraint if exists ai_conversations_module_number_check;
alter table public.ai_conversations drop column if exists module_number;
-- Tighten existing workspace_key check (constraint name from copilot_v1)
-- to enforce the canonical 6-key set (already does — just confirm shape).
commit;

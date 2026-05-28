-- TIM-1275: add cache token columns to ai_conversations for caching observability
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS cache_read_tokens integer,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens integer;

-- TIM-3076: Add preferred_language to users for Phase 1 multi-language AI outputs.
-- Only generated content (business plan, copilot, draft generators) respects the
-- locale. Field names, UI labels, and routing stay in English.
alter table public.users
  add column if not exists preferred_language text not null default 'en';

-- TIM-1145: Address autocomplete + AI area analysis.
-- Add structured geo fields and a cached area-analysis text so the AI can reason
-- about the actual neighborhood once the user picks a place from autocomplete.

alter table public.location_candidates
  add column if not exists lat                numeric(9,6),
  add column if not exists lng                numeric(9,6),
  add column if not exists city               text,
  add column if not exists postal_code        text,
  add column if not exists country            text,
  add column if not exists area_analysis      text,
  add column if not exists area_analysis_at   timestamptz;

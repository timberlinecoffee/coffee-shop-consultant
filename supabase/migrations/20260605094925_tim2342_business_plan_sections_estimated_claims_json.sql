-- TIM-2342: Per-section bucket for AI estimated-class claims surfaced by the
-- narrative LLM. The generate route parses <num src="estimate" hedge="…">…</num>
-- markers, strips them from user_content, and stores the structured list here
-- so the export-gate modal can present "Estimated claims to verify" without
-- re-parsing prose. Stored as jsonb so we can index later if usage grows.
--
-- Shape: array of objects matching the EstimatedClaim type in
-- src/lib/business-plan/source-markers.ts:
--   [{ id, section_key, content, hedge, surrounding_sentence }, ...]
--
-- DEFAULT '[]'::jsonb keeps the column non-null without backfilling rows; the
-- modal treats the empty array as "no estimates to review for this section".

ALTER TABLE public.business_plan_sections
  ADD COLUMN IF NOT EXISTS estimated_claims_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Touch comment so future readers see where to look for the contract.
COMMENT ON COLUMN public.business_plan_sections.estimated_claims_json IS
  'TIM-2342: AI-estimate-class claims extracted from the narrative LLM''s <num src="estimate"> markers. Surfaced to the export-gate modal for human review. Shape matches EstimatedClaim in src/lib/business-plan/source-markers.ts.';

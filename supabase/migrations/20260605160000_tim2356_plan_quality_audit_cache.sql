-- TIM-2356: Cache table for Plan Quality Check audit reports.
--
-- The audit endpoint aggregates workspace state, runs every validator rule, and
-- synthesizes each finding into plain-language fields with Haiku. That synthesis
-- pass is the expensive step (one LLM call per finding). We cache the full
-- report by (user_id, plan_id, state_hash) so re-clicking "Check Plan" without
-- editing anything is instant and free.
--
-- state_hash: sha256 of the canonical plan_state + section text snapshot the
-- audit ran against. Any workspace mutation invalidates the cache; the next
-- click recomputes.
--
-- Rule 1 — RLS enabled, deny-by-default. Users can only see their own rows.
-- Rule 2 — server route still re-checks ownership before insert/select.

CREATE TABLE IF NOT EXISTS public.plan_quality_audit_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  state_hash text NOT NULL,
  report_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_quality_audit_cache_lookup_idx
  ON public.plan_quality_audit_cache (user_id, plan_id, state_hash, created_at DESC);

ALTER TABLE public.plan_quality_audit_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_quality_audit_cache_owner_select"
  ON public.plan_quality_audit_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "plan_quality_audit_cache_owner_insert"
  ON public.plan_quality_audit_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plan_quality_audit_cache_owner_delete"
  ON public.plan_quality_audit_cache
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.plan_quality_audit_cache IS
  'TIM-2356: Cached Plan Quality Check audit reports. Keyed by (user_id, plan_id, state_hash); state_hash is sha256 of canonical plan_state + section text snapshot.';

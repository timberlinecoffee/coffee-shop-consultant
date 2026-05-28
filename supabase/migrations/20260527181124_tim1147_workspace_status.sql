-- TIM-1147: Manual workspace + component status for the Groundwork suite.
--
-- Replaces auto-computed completion percentages with an explicit 3-state model:
--   not_started (0%), in_progress (50%), complete (100%).
--
-- Component keys are stable identifiers per plan. The Groundwork app uses one
-- row per workspace (workspace key, e.g. 'concept'). Nested component keys are
-- allowed for future per-section controls (e.g. 'concept:problem') and reuse
-- the same row shape and RLS policies.

CREATE TABLE IF NOT EXISTS public.workspace_status (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid        NOT NULL REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  component_key text        NOT NULL CHECK (length(component_key) BETWEEN 1 AND 128),
  status        text        NOT NULL DEFAULT 'not_started'
                            CHECK (status IN ('not_started', 'in_progress', 'complete')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, component_key)
);

CREATE INDEX IF NOT EXISTS workspace_status_plan_id_idx
  ON public.workspace_status (plan_id);

ALTER TABLE public.workspace_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_owner_read_workspace_status"
  ON public.workspace_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.coffee_shop_plans p
      WHERE p.id = workspace_status.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_owner_write_workspace_status"
  ON public.workspace_status
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.coffee_shop_plans p
      WHERE p.id = workspace_status.plan_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.coffee_shop_plans p
      WHERE p.id = workspace_status.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER handle_workspace_status_updated_at
  BEFORE UPDATE ON public.workspace_status
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

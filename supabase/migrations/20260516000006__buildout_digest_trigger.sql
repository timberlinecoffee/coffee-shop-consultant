-- TIM-727: Cost rollup — server-side _digest recompute function + equipment items trigger.
-- Recomputes equipment aggregates and bid totals into workspace_documents.content._digest
-- whenever buildout_equipment_items are written.

-- ── recompute_buildout_digest ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_buildout_digest(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_equipment_total_cents   bigint;
  v_must_have_total_cents   bigint;
  v_nice_to_have_total_cents bigint;
  v_buildout_bid_total_cents bigint;
  v_open_permits_count       integer;
  v_content                  jsonb;
BEGIN
  -- Aggregate equipment items (non-archived only)
  SELECT
    COALESCE(SUM(quantity * unit_cost_cents), 0),
    COALESCE(SUM(CASE WHEN priority_tier = 'must_have'    THEN quantity * unit_cost_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN priority_tier = 'nice_to_have' THEN quantity * unit_cost_cents ELSE 0 END), 0)
  INTO v_equipment_total_cents, v_must_have_total_cents, v_nice_to_have_total_cents
  FROM public.buildout_equipment_items
  WHERE plan_id = p_plan_id
    AND archived = false;

  -- Read existing workspace document content
  SELECT content
  INTO v_content
  FROM public.workspace_documents
  WHERE plan_id = p_plan_id
    AND workspace_key = 'buildout_equipment';

  -- No document yet — nothing to update
  IF v_content IS NULL THEN
    RETURN;
  END IF;

  -- Sum contractor bids with status in (received, accepted)
  SELECT COALESCE(
    SUM((bid->>'bid_total_cents')::bigint), 0
  )
  INTO v_buildout_bid_total_cents
  FROM jsonb_array_elements(
    COALESCE(v_content->'contractor_bids', '[]'::jsonb)
  ) AS bid
  WHERE bid->>'status' IN ('received', 'accepted');

  -- Count open permits (items where completed is not true)
  SELECT COUNT(*)
  INTO v_open_permits_count
  FROM jsonb_array_elements(
    COALESCE(v_content->'permits'->'items', '[]'::jsonb)
  ) AS p
  WHERE (p->>'completed') IS DISTINCT FROM 'true';

  -- Merge _digest into content, preserving all other user fields and any
  -- existing _digest fields not recomputed here (e.g. next_milestone).
  UPDATE public.workspace_documents
  SET content = jsonb_set(
    content,
    '{_digest}',
    COALESCE(content->'_digest', '{}'::jsonb) || jsonb_build_object(
      'equipment_total_cents',    v_equipment_total_cents,
      'must_have_total_cents',    v_must_have_total_cents,
      'nice_to_have_total_cents', v_nice_to_have_total_cents,
      'buildout_bid_total_cents', v_buildout_bid_total_cents,
      'open_permits_count',       v_open_permits_count
    )
  )
  WHERE plan_id = p_plan_id
    AND workspace_key = 'buildout_equipment';
END;
$$;

-- ── trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_buildout_items_recompute_digest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_buildout_digest(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_id ELSE NEW.plan_id END
  );
  RETURN NULL;
END;
$$;

-- ── trigger ───────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS buildout_items_recompute_digest
  ON public.buildout_equipment_items;

CREATE TRIGGER buildout_items_recompute_digest
  AFTER INSERT OR UPDATE OR DELETE
  ON public.buildout_equipment_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_buildout_items_recompute_digest();

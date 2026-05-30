-- TIM-1450: Backfill workspace_status for plans that already have content saved
-- in workspace_documents (covers autosave workspaces: concept, marketing,
-- operations_playbook, financials, etc.).
-- CRUD workspaces (hiring, menu_pricing, location_lease, etc.) rely on the
-- client-side promoteOnEdit hook that fires on page load when data exists.

INSERT INTO public.workspace_status (id, plan_id, component_key, status, updated_at)
SELECT
  gen_random_uuid(),
  wd.plan_id,
  wd.workspace_key,
  'in_progress',
  now()
FROM public.workspace_documents wd
WHERE wd.content IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_status ws
    WHERE ws.plan_id = wd.plan_id
      AND ws.component_key = wd.workspace_key
  )
ON CONFLICT DO NOTHING;

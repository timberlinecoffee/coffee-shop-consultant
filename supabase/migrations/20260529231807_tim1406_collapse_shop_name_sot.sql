-- TIM-1406: Collapse shop-name fork.
-- Single source of truth for the shop's display name is coffee_shop_plans.plan_name.
-- Backfill plan_name from the concept workspace document so the V2/V1 shadow
-- values are aligned before code paths cut over to read-through.
--
-- Order of precedence on backfill (newest wins):
--   1. workspace_documents.content.components.shop_identity.content (V2, written by concept editor)
--   2. workspace_documents.content.name (V1, written by onboarding only)
--   3. existing coffee_shop_plans.plan_name (unchanged)

update coffee_shop_plans p
set plan_name = coalesce(
  nullif(trim(d.content->'components'->'shop_identity'->>'content'), ''),
  nullif(trim(d.content->>'name'), ''),
  p.plan_name
)
from workspace_documents d
where d.plan_id = p.id
  and d.workspace_key = 'concept'
  and coalesce(
        nullif(trim(d.content->'components'->'shop_identity'->>'content'), ''),
        nullif(trim(d.content->>'name'), ''),
        p.plan_name
      ) is distinct from p.plan_name;

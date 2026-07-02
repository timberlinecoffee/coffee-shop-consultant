-- TIM-3111: Business Plan custom sections — first-class entity separate from
-- standard section taxonomy. Custom sections persist alongside standard ones,
-- autosave per TIM-2756 pattern, and render in the PDF export per TIM-1062.

CREATE TABLE business_plan_custom_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES coffee_shop_plans(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'Custom Section',
  user_content text,
  is_visible  boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Rule 1: RLS enabled + deny-by-default (no public access; service role only
-- bypasses RLS — explicit policies below grant owner access).
ALTER TABLE business_plan_custom_sections ENABLE ROW LEVEL SECURITY;

-- Owner read: user must own the plan referenced by plan_id.
CREATE POLICY "owner_select" ON business_plan_custom_sections
  FOR SELECT USING (
    plan_id IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

-- Owner insert: user must own the plan.
CREATE POLICY "owner_insert" ON business_plan_custom_sections
  FOR INSERT WITH CHECK (
    plan_id IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

-- Owner update: user must own the plan.
CREATE POLICY "owner_update" ON business_plan_custom_sections
  FOR UPDATE USING (
    plan_id IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

-- Owner delete: user must own the plan.
CREATE POLICY "owner_delete" ON business_plan_custom_sections
  FOR DELETE USING (
    plan_id IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

-- Keep updated_at current on every write.
CREATE OR REPLACE FUNCTION update_business_plan_custom_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_plan_custom_sections_updated_at
  BEFORE UPDATE ON business_plan_custom_sections
  FOR EACH ROW EXECUTE FUNCTION update_business_plan_custom_sections_updated_at();

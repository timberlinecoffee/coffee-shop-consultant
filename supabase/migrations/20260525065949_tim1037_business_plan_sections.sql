-- TIM-1037: Business Plan Generator v1
-- Stores per-section user overrides + visibility toggles for the business plan.
-- Auto-populated content is assembled at query time from source-of-truth tables.

CREATE TABLE IF NOT EXISTS business_plan_sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  section_key     text NOT NULL,
  user_content    text,           -- null = show auto-populated content; non-null = user override
  is_visible      boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT business_plan_sections_plan_section_unique UNIQUE (plan_id, section_key)
);

ALTER TABLE business_plan_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_plan_sections_select" ON business_plan_sections
  FOR SELECT USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_sections_insert" ON business_plan_sections
  FOR INSERT WITH CHECK (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_sections_update" ON business_plan_sections
  FOR UPDATE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_sections_delete" ON business_plan_sections
  FOR DELETE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_business_plan_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_plan_sections_updated_at
  BEFORE UPDATE ON business_plan_sections
  FOR EACH ROW EXECUTE FUNCTION update_business_plan_sections_updated_at();

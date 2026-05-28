-- TIM-1225: Business Plan branded export — cover settings table + logo storage.
-- Mirrors RLS from business_plan_sections (TIM-1037).

CREATE TABLE IF NOT EXISTS business_plan_cover (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  template_id     text NOT NULL DEFAULT 'classic',
  accent_color    text,                 -- hex e.g. #E8C24A; null → template default
  logo_path       text,                 -- storage object path; null → no logo
  tagline         text,
  prepared_for    text,
  author_name     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT business_plan_cover_plan_unique UNIQUE (plan_id)
);

ALTER TABLE business_plan_cover ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_plan_cover_select" ON business_plan_cover
  FOR SELECT USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_cover_insert" ON business_plan_cover
  FOR INSERT WITH CHECK (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_cover_update" ON business_plan_cover
  FOR UPDATE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "business_plan_cover_delete" ON business_plan_cover
  FOR DELETE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION update_business_plan_cover_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_plan_cover_updated_at
  BEFORE UPDATE ON business_plan_cover
  FOR EACH ROW EXECUTE FUNCTION update_business_plan_cover_updated_at();

-- Private storage bucket for business plan logos.
-- Path convention: {plan_id}/logo.<ext>
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-plan-logos',
  'business-plan-logos',
  false,
  2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage objects: owner can do all ops on their plan's folder.
CREATE POLICY "business_plan_logos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'business-plan-logos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "business_plan_logos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'business-plan-logos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "business_plan_logos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'business-plan-logos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "business_plan_logos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'business-plan-logos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

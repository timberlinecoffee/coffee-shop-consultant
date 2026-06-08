-- TIM-1700 / TIM-1707: Per-plan brand config (logo path + color overrides)
-- and the shop-brand-logos storage bucket.
--
-- Idempotent: safe to re-run. Created via `supabase db push` (Path A) or
-- MCP `apply_migration` (Path B). For the dashboard SQL-editor fallback, use
-- drafts/APPLY_tim1700_dashboard_oneshot.sql which appends the
-- schema_migrations bookkeeping row so this version stays drift-consistent.

-- ── brand_config table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brand_config (
  plan_id          UUID PRIMARY KEY REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  logo_path        TEXT,
  primary_color    TEXT,
  accent_color     TEXT,
  ink_color        TEXT,
  paper_color      TEXT,
  muted_color      TEXT,
  rule_color       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.brand_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_config_owner_select" ON public.brand_config;
CREATE POLICY "brand_config_owner_select"
  ON public.brand_config FOR SELECT
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "brand_config_owner_insert" ON public.brand_config;
CREATE POLICY "brand_config_owner_insert"
  ON public.brand_config FOR INSERT
  WITH CHECK (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "brand_config_owner_update" ON public.brand_config;
CREATE POLICY "brand_config_owner_update"
  ON public.brand_config FOR UPDATE
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "brand_config_owner_delete" ON public.brand_config;
CREATE POLICY "brand_config_owner_delete"
  ON public.brand_config FOR DELETE
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

-- ── shop-brand-logos storage bucket ──────────────────────────────────────────
-- Private, 2 MB limit (2097152 bytes), image MIME types only.
-- Created via SQL so no separate dashboard UI step is required.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-brand-logos',
  'shop-brand-logos',
  false,
  2097152,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── shop-brand-logos object RLS policies ──────────────────────────────────────
-- Files are namespaced by plan id as the first folder segment.

DROP POLICY IF EXISTS "shop_brand_logos_owner_select" ON storage.objects;
CREATE POLICY "shop_brand_logos_owner_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_brand_logos_owner_insert" ON storage.objects;
CREATE POLICY "shop_brand_logos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_brand_logos_owner_update" ON storage.objects;
CREATE POLICY "shop_brand_logos_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_brand_logos_owner_delete" ON storage.objects;
CREATE POLICY "shop_brand_logos_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

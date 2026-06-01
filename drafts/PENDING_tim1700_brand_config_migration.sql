-- TIM-1700: Per-plan brand config (logo path + color overrides).
-- STATUS: PENDING — must be applied via Supabase MCP `apply_migration` to get
-- the server-assigned version, then committed to supabase/migrations/<version>_tim1700_brand_config.sql.
-- Do NOT hand-assign a version (see CLAUDE.md / supabase/migrations/README.md).
--
-- Unblock owner: CEO (needs Supabase MCP credentials).
-- Apply command: apply_migration({ name: "tim1700_brand_config", query: <contents below> })
-- Then: SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1;
-- Then: rename/copy this file to supabase/migrations/<version>_tim1700_brand_config.sql and commit.

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

CREATE POLICY "brand_config_owner_select"
  ON public.brand_config FOR SELECT
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

CREATE POLICY "brand_config_owner_insert"
  ON public.brand_config FOR INSERT
  WITH CHECK (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

CREATE POLICY "brand_config_owner_update"
  ON public.brand_config FOR UPDATE
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

CREATE POLICY "brand_config_owner_delete"
  ON public.brand_config FOR DELETE
  USING (plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()));

-- ── shop-brand-logos storage bucket ──────────────────────────────────────────
-- The bucket itself must be created via Supabase dashboard or MCP before these
-- policies are applied. Bucket settings: private, 2MB limit,
-- allowed MIME: image/png, image/jpeg, image/jpg, image/webp, image/svg+xml.

CREATE POLICY "shop_brand_logos_owner_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "shop_brand_logos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "shop_brand_logos_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "shop_brand_logos_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'shop-brand-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

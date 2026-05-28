-- TIM-1215: User UI preferences table (column order, visibility)
-- Keyed by (user_id, pref_key) → JSONB blob.
-- Used for buildout table column order and visibility, persisted per-user
-- so it survives page reload and works across browsers.

CREATE TABLE IF NOT EXISTS public.user_ui_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pref_key TEXT NOT NULL,
  pref_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, pref_key)
);

ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_ui_prefs" ON public.user_ui_prefs;
CREATE POLICY "owner_all_ui_prefs" ON public.user_ui_prefs
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_ui_prefs_user_key
  ON public.user_ui_prefs(user_id, pref_key);

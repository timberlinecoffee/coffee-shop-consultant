-- TIM-2434: Document Import pipeline.
--
-- Two tables + one private storage bucket back the upload → parse → extract →
-- review flow described in the UX spec on TIM-2433:
--
--   document_imports        — one row per "import session" the user starts
--                              from the companion drawer or Settings. Carries
--                              the credit estimate + actual charge, the session
--                              status (uploading/extracting/ready/applied/...),
--                              and the merged proposed-changes JSON the unified
--                              review modal consumes.
--   document_import_files   — one row per uploaded file in the session. Carries
--                              file metadata, storage path, parse/extract
--                              per-file status + error code, and the raw
--                              extracted JSON (suite-mapped fields + sources).
--
-- Standing engineering rules applied:
--   Rule 1 — RLS enabled on both tables, deny-by-default; owner-only policies
--            scoped to the parent plan via coffee_shop_plans.user_id.
--   Rule 2 — every paid path re-checks ownership server-side; client gates are
--            UX. Service-role inserts on the metric row remain service-only.
--   Rule 3 — extracted_json is stored as jsonb so the extraction worker can
--            validate with zod before insert (see src/lib/document-import).
--   Rule 4 — upload + extract API routes wire enforceRateLimit() (TIM-2246).
--   Rule 5 — sanitised error_code/error_message columns avoid leaking raw
--            parser stack traces; UI maps codes to user-friendly messages.

-- ── document_imports ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Session lifecycle: uploading → estimated → extracting → ready → applied
  -- → archived. "error" is a terminal state for the session as a whole;
  -- per-file errors live on document_import_files.
  status          text NOT NULL DEFAULT 'uploading'
                    CHECK (status IN (
                      'uploading','estimated','extracting','ready',
                      'applied','archived','error','cancelled')),
  -- Estimate shown to the user BEFORE charging anything (UX requirement).
  estimated_credits integer NOT NULL DEFAULT 0,
  -- Actual credits charged after extraction completes; sum of per-file actuals.
  credits_charged integer NOT NULL DEFAULT 0,
  -- Source surface: 'onboarding' | 'settings' | 'companion'. Drives Klaviyo
  -- attribution + the post-import success message.
  source          text NOT NULL DEFAULT 'companion'
                    CHECK (source IN ('onboarding','settings','companion')),
  -- Free-text label the user gives the session ("Q4 financials", etc.).
  label           text,
  -- Final extraction error code when status='error'. Sanitised; never raw
  -- exception text. UI maps to user-friendly copy (TIM-2434 Rule 5).
  error_code      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_imports_plan_created_idx
  ON public.document_imports (plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_imports_user_status_idx
  ON public.document_imports (user_id, status, created_at DESC);

ALTER TABLE public.document_imports ENABLE ROW LEVEL SECURITY;

-- Owner-only via the parent plan. Mirrors the business_plan_cover pattern.
CREATE POLICY "document_imports_select"
  ON public.document_imports
  FOR SELECT
  USING (
    plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "document_imports_insert"
  ON public.document_imports
  FOR INSERT
  WITH CHECK (
    plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "document_imports_update"
  ON public.document_imports
  FOR UPDATE
  USING (
    plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "document_imports_delete"
  ON public.document_imports
  FOR DELETE
  USING (
    plan_id IN (SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.update_document_imports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_imports_updated_at
  BEFORE UPDATE ON public.document_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_document_imports_updated_at();

COMMENT ON TABLE public.document_imports IS
  'TIM-2434: One row per document-import session. Carries credit estimate/charge, session lifecycle, source surface.';

-- ── document_import_files ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_import_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES public.document_imports(id) ON DELETE CASCADE,
  -- Storage object path inside the 'document-imports' bucket. Convention:
  -- {user_id}/{import_id}/{file_id}.{ext}
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  file_size_bytes integer NOT NULL,
  -- Normalised type: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'png' | 'jpg'.
  file_type       text NOT NULL
                    CHECK (file_type IN ('pdf','docx','xlsx','csv','png','jpg')),
  -- Per-file lifecycle. queued → parsing → extracting → complete | error |
  -- no_content (extraction ran but found nothing useful).
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN (
                      'queued','parsing','extracting','complete',
                      'error','no_content')),
  -- Sanitised error code; UI maps codes to user copy.
  error_code      text,
  -- Total pages (PDF), rows (XLSX), or 1 (DOCX/image). Drives credit estimate.
  page_count      integer NOT NULL DEFAULT 1,
  -- Suite-mapped extraction output. Validated with zod before insert.
  -- Shape (per TIM-2433 plan):
  --   { proposedChanges: [{ suite, fieldKey, fieldLabel, proposedValue,
  --                         sourceFileName, confidence }] }
  extracted_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Credits actually charged for this file. Sum rolls up to document_imports.
  credits_charged integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_import_files_import_idx
  ON public.document_import_files (import_id, created_at);
CREATE INDEX IF NOT EXISTS document_import_files_status_idx
  ON public.document_import_files (status, created_at DESC);

ALTER TABLE public.document_import_files ENABLE ROW LEVEL SECURITY;

-- Owner-only via the parent session → parent plan.
CREATE POLICY "document_import_files_select"
  ON public.document_import_files
  FOR SELECT
  USING (
    import_id IN (
      SELECT di.id
      FROM public.document_imports di
      JOIN public.coffee_shop_plans p ON p.id = di.plan_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "document_import_files_insert"
  ON public.document_import_files
  FOR INSERT
  WITH CHECK (
    import_id IN (
      SELECT di.id
      FROM public.document_imports di
      JOIN public.coffee_shop_plans p ON p.id = di.plan_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "document_import_files_update"
  ON public.document_import_files
  FOR UPDATE
  USING (
    import_id IN (
      SELECT di.id
      FROM public.document_imports di
      JOIN public.coffee_shop_plans p ON p.id = di.plan_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "document_import_files_delete"
  ON public.document_import_files
  FOR DELETE
  USING (
    import_id IN (
      SELECT di.id
      FROM public.document_imports di
      JOIN public.coffee_shop_plans p ON p.id = di.plan_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE TRIGGER document_import_files_updated_at
  BEFORE UPDATE ON public.document_import_files
  FOR EACH ROW EXECUTE FUNCTION public.update_document_imports_updated_at();

COMMENT ON TABLE public.document_import_files IS
  'TIM-2434: Per-file row inside a document_imports session. Carries storage path, parse/extract status, suite-mapped extracted_json.';

-- ── Private storage bucket ─────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-imports',
  'document-imports',
  false,
  52428800,  -- 50 MB per UX spec
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage objects: owner can do all ops on their {user_id}/ folder.
-- Path convention: {user_id}/{import_id}/{file_id}.{ext}
CREATE POLICY "document_imports_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'document-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "document_imports_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'document-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "document_imports_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'document-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "document_imports_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'document-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- TIM-2254: Account deletion + data export endpoints (Phase 1 hardening §7).
-- Spec: TIM-2250 deletion-spec document.
--
-- Adds:
--   1. public.account_deletion_audit_log — service-role-only PII-free deletion log.
--   2. public.account_export_requests    — per-user export-request rows with
--      RLS: user can read/insert their own.
--   3. public.users anonymisation columns (deleted_at, is_deleted).
--      Also makes users.email nullable so the row can be anonymised in-place
--      without violating the constraint. The row is preserved because invoices /
--      subscriptions FKs cascade through public.users; payment records must be
--      retained for 7 years per spec §8.
--
-- Standing rules applied:
--   Rule 1 (RLS) — both new tables enable RLS with deny-by-default policies.
--   Rule 2 (Server-side authz) — only the /api/account/{export-request,delete}
--          routes write; service-role bypass is the only path to the audit log.
--   Rule 3 (Validation) — column constraints bound text lengths.
--   Rule 5 (No raw errors) — N/A at the schema layer.

CREATE TABLE IF NOT EXISTS public.account_deletion_audit_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  action                   text NOT NULL
                             CHECK (action IN (
                               'export_requested',
                               'export_completed',
                               'export_failed',
                               'delete_requested',
                               'delete_completed',
                               'delete_failed'
                             )),
  -- Hashed user reference: sha256(user_id || ':' || ACCOUNT_DELETION_AUDIT_SALT).
  -- No raw user_id, no email — keeps the log PII-free per spec §10.
  user_hash                text NOT NULL CHECK (char_length(user_hash) = 64),
  email_hash               text NOT NULL CHECK (char_length(email_hash) = 64),
  -- Retained references for audit + legal trace; not PII on their own.
  stripe_subscription_id   text,
  stripe_customer_id       text,
  -- Per-table delete counts so we can prove scope without storing content.
  data_summary             jsonb,
  -- Hashed IP to detect repeat abusers without storing source IPs.
  request_ip_hash          text,
  error_message            text CHECK (char_length(coalesce(error_message,'')) <= 500)
);

CREATE INDEX IF NOT EXISTS account_deletion_audit_log_created_at_idx
  ON public.account_deletion_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_audit_log_user_hash_idx
  ON public.account_deletion_audit_log (user_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_audit_log_action_idx
  ON public.account_deletion_audit_log (action, created_at DESC);

ALTER TABLE public.account_deletion_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only, mirrors public.admin_audit_log (TIM-1942).

COMMENT ON TABLE public.account_deletion_audit_log IS
  'TIM-2254: PII-free account-deletion and export audit log. Service-role-only.';

CREATE TABLE IF NOT EXISTS public.account_export_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','ready','failed','expired')),
  -- Storage path under the per-user prefix in the `account-exports` bucket
  -- (created in this migration below). Signed URL is regenerated on download.
  storage_path        text,
  -- Hard expiry so signed URLs cannot be replayed indefinitely.
  expires_at          timestamptz,
  -- Best-effort delivery email (snapshot at request time so anonymisation does
  -- not clobber the address we promised the export to).
  delivery_email      text NOT NULL CHECK (char_length(delivery_email) BETWEEN 3 AND 320),
  size_bytes          bigint,
  error_message       text CHECK (char_length(coalesce(error_message,'')) <= 500)
);

CREATE INDEX IF NOT EXISTS account_export_requests_user_idx
  ON public.account_export_requests (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS account_export_requests_status_idx
  ON public.account_export_requests (status, requested_at DESC);

ALTER TABLE public.account_export_requests ENABLE ROW LEVEL SECURITY;

-- Owner can SELECT their own export requests (for status UI).
CREATE POLICY account_export_requests_owner_select
  ON public.account_export_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owner can INSERT for themselves. We also rate-limit in the API layer.
CREATE POLICY account_export_requests_owner_insert
  ON public.account_export_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies for users — only the service-role worker
-- transitions pending -> ready/failed.

COMMENT ON TABLE public.account_export_requests IS
  'TIM-2254: queued GDPR/CASL data-export requests. RLS owner-read/insert; service-role-only update.';

-- Anonymisation columns + nullable email so the row can be anonymised in-place.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL;

-- Index to fast-filter out anonymised rows from admin views without scanning.
CREATE INDEX IF NOT EXISTS users_is_deleted_idx
  ON public.users (is_deleted) WHERE is_deleted = true;

COMMENT ON COLUMN public.users.deleted_at IS
  'TIM-2254: timestamp when account_delete_completed; row is anonymised, not removed (FK retention).';
COMMENT ON COLUMN public.users.is_deleted IS
  'TIM-2254: true once the user has been anonymised. UI and API treat as logged-out.';

-- Private bucket for export ZIPs. RLS on storage.objects is owner-only via the
-- API path; the bucket itself is non-public so direct URL access fails.
INSERT INTO storage.buckets (id, name, public)
VALUES ('account-exports', 'account-exports', false)
ON CONFLICT (id) DO NOTHING;

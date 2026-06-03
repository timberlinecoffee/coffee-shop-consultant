-- TIM-1942: Admin portal audit log.
-- Every state-changing admin action (subscription change, account cancel,
-- password reset, support-message status change) appends a row here. Service-
-- role-only read via /api/admin/audit-log; RLS enabled with no policies so the
-- anon + authenticated roles get zero access.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email    text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email   text,
  action         text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  before_state   jsonb,
  after_state    jsonb,
  metadata       jsonb
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON public.admin_audit_log (action, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies. Service-role bypasses RLS; the
-- admin API is the only path that writes or reads this table.

COMMENT ON TABLE public.admin_audit_log IS
  'TIM-1942: admin-portal action audit log. Service-role-only access.';

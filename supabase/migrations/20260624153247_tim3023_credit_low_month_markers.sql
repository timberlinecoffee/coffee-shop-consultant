-- TIM-3023: Persistent month-key marker for the credit-balance-low monitor
-- (TIM-2366 PR #152). One row per (user_id, month_key) records that the
-- "your credits are running low" notice has already gone out this calendar
-- month. The monitor (`src/lib/email/credit-balance-monitor.ts`) does the
-- peek → guard → send → mark-only-on-success ordering; this table is the
-- backing store for `hasNoticedThisMonth` / `markNoticedThisMonth`.
--
-- Service-role-only — mirrors the TIM-1942 admin_audit_log pattern. The
-- monitor is wired into server-side credit-grant + credit-debit boundaries
-- (Stripe webhook, copilot streams, business-plan generators, etc.), all of
-- which already run with the service-role client.
--
-- Standing Rule 1 (TIM-2242/TIM-2252): RLS enabled, NO policies → anon +
-- authenticated roles get zero access.

CREATE TABLE IF NOT EXISTS public.credit_low_month_markers (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month_key  text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_key),
  CONSTRAINT credit_low_month_markers_month_key_format
    CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE public.credit_low_month_markers IS
  'TIM-3023: one-shot-per-calendar-month dedup table for the credit-balance-low transactional email (TIM-2366 #25). Service-role-only — RLS enabled with no policies.';

COMMENT ON COLUMN public.credit_low_month_markers.month_key IS
  'YYYY-MM (UTC) the notice was sent for. Composite PK with user_id enforces at most one notice per user per calendar month.';

ALTER TABLE public.credit_low_month_markers ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies. Service-role bypasses RLS;
-- direct anon/authenticated access is denied by default. Pattern matches
-- public.admin_audit_log (TIM-1942) and public.account_deletion_audit_log
-- (TIM-2254).

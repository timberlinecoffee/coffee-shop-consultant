-- TIM-3448: email_consent_log — CASL s.10(1) audit trail.
--
-- CASL s.10(1) requires an audit trail of consent to send commercial
-- electronic messages. New waitlist signups write one row per signup;
-- existing waitlist (pre-CASL audit) is backfilled via the
-- /api/cron/klaviyo-consent-backfill endpoint with consent_type='implied'.
--
-- Service-role-only (RLS on, REVOKE ALL from anon/authenticated, no policies).
-- Pattern mirrors admin_audit_log, platform_settings, stripe_processed_events.
-- Standing Rule 1 (TIM-2252). CTO DDL/RLS sign-off required before merge.

CREATE TABLE public.email_consent_log (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email               TEXT        NOT NULL,
  consent_type        TEXT        NOT NULL CHECK (consent_type IN ('express', 'implied')),
  consent_source      TEXT        NOT NULL CHECK (consent_source IN ('waitlist_signup', 'waitlist_backfill_pre_casl')),
  marketing_opted_in  BOOLEAN     NOT NULL,
  klaviyo_subscribed  BOOLEAN,
  klaviyo_profile_id  TEXT,
  ip_address          TEXT,
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_consent_log FROM anon, authenticated;
-- No policies: service_role (BYPASSRLS) retains full read/write.

CREATE INDEX idx_email_consent_log_email     ON public.email_consent_log (email);
CREATE INDEX idx_email_consent_log_consented ON public.email_consent_log (consented_at DESC);
CREATE INDEX idx_email_consent_log_source    ON public.email_consent_log (consent_source);

COMMENT ON TABLE public.email_consent_log IS
  'TIM-3448 — CASL s.10(1) audit trail. One row per consent event (signup or backfill). Service-role-only. Never expose to anon/authenticated via PostgREST.';

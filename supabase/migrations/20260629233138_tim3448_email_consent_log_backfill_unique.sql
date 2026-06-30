-- TIM-3448: partial unique index so the backfill endpoint is idempotent.
-- Multiple 'waitlist_signup' rows per email are intentional (user can re-submit
-- the form) but only one 'waitlist_backfill_pre_casl' row should exist per email.
CREATE UNIQUE INDEX idx_email_consent_log_backfill_unique
  ON public.email_consent_log (email)
  WHERE consent_source = 'waitlist_backfill_pre_casl';

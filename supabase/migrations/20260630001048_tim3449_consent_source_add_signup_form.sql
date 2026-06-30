-- TIM-3449: extend email_consent_log.consent_source CHECK to include 'signup_form'.
--
-- The TIM-3448 migration created the table with consent_source restricted to
-- ('waitlist_signup', 'waitlist_backfill_pre_casl'). TIM-3449 adds 'signup_form'
-- to the TypeScript ConsentSource union but shipped no corresponding migration,
-- causing every signup-form audit insert to fail the CHECK constraint silently
-- (writeConsentRecord swallows DB errors). This migration widens the constraint
-- to include 'signup_form', restoring the CASL s.10(1) audit trail for new
-- accounts signed up via the main auth form.

ALTER TABLE public.email_consent_log
  DROP CONSTRAINT email_consent_log_consent_source_check,
  ADD CONSTRAINT email_consent_log_consent_source_check
    CHECK (consent_source IN ('waitlist_signup', 'waitlist_backfill_pre_casl', 'signup_form'));

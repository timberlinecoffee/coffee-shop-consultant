-- TIM-685: Add edge-function columns to auth_users_audit.
-- The table was created by the TIM-678 trigger migration with a different schema.
-- The qa-fixture-admin Edge Function writes: op, target_email, outcome, refusal_code, source_ip.
-- 'op' already exists; add the four missing columns.

ALTER TABLE public.auth_users_audit
  ADD COLUMN IF NOT EXISTS target_email  text,
  ADD COLUMN IF NOT EXISTS outcome       text CHECK (outcome IN ('allowed', 'refused')),
  ADD COLUMN IF NOT EXISTS refusal_code  text,
  ADD COLUMN IF NOT EXISTS source_ip     text;

COMMENT ON COLUMN public.auth_users_audit.target_email  IS 'Email targeted by the qa-fixture-admin Edge Function call.';
COMMENT ON COLUMN public.auth_users_audit.outcome       IS 'allowed or refused — set by Edge Function only.';
COMMENT ON COLUMN public.auth_users_audit.refusal_code  IS 'Reason for refusal, e.g. not_allowlisted.';
COMMENT ON COLUMN public.auth_users_audit.source_ip     IS 'x-forwarded-for header from Edge Function caller.';

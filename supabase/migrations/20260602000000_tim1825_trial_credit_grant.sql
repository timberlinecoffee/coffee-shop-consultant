-- TIM-1825: convert the free trial from a 5-message counter to a one-time
-- 15-credit grant.
--
-- The grant is applied lazily in application code (ensureTrialGrant in
-- src/lib/credits/trial.ts) on a trial user's first credit-gated action, gated
-- on the trial_credits_granted flag added here. Trial actions then debit
-- variable credits through the same path as paid tiers (src/lib/credits/cost.ts).
--
-- This migration is additive and safe to apply BEFORE the code deploy. It MUST
-- be applied before the TIM-1825 code merges to main, because the API routes
-- now read users.trial_credits_granted.
--
-- Apply with Path A so the recorded version matches this filename (see
-- supabase/migrations/README.md):
--     supabase db push
-- Do NOT apply via the MCP apply_migration tool without reading the
-- server-assigned version back and renaming this file to match it.

-- 1) One-time-grant idempotency flag. Existing trial users (flag defaults to
--    false) are topped up to 15 on their next action; new users likewise.
alter table public.users
  add column if not exists trial_credits_granted boolean not null default false;

-- 2) Allow a 'trial_grant' ledger type alongside the existing transaction types
--    so the one-time grant is auditable in credit_transactions.
alter table public.credit_transactions
  drop constraint if exists credit_transactions_type_check;
alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('monthly_allocation', 'purchase', 'usage', 'trial_grant'));

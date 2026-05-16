-- TIM-642: Stripe webhook hardening
-- 1. Allow past_due on users.subscription_status
-- 2. Idempotency table for stripe events

-- Drop and recreate the check constraint to add past_due
alter table public.users
  drop constraint if exists users_subscription_status_check;

alter table public.users
  add constraint users_subscription_status_check
  check (subscription_status in ('free_trial', 'active', 'cancelled', 'expired', 'past_due'));

-- Idempotency: track processed Stripe event IDs
create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

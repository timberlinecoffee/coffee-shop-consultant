-- TIM-1741: platform-wide (per-account) localization settings.
--
-- Currency is the headline deliverable; date/number/timezone/fiscal-year
-- preferences ride along in a jsonb column so the Localization settings group
-- can grow without further DDL. NULL currency_code preserves current behavior
-- (USD) so this migration is non-breaking for existing accounts.
alter table public.users
  add column if not exists currency_code text,
  add column if not exists localization jsonb not null default '{}'::jsonb;

comment on column public.users.currency_code is
  'ISO 4217 platform currency for this account. NULL = USD (default behavior). TIM-1741.';
comment on column public.users.localization is
  'Localization preferences: dateFormat, numberFormat, timezone, fiscalYearStartMonth. TIM-1741.';

-- No new RLS needed: the existing "Users can update own profile" /
-- "Users can view own profile" policies on public.users already scope these
-- columns to the owning account (auth.uid() = id).

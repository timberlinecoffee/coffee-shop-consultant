-- ============================================================================
-- TIM-1707 (canonical "Option A" for confirmation 9bff0240)
-- ONE-PASTE Supabase SQL bundle: applies the full pending-migration backlog
-- plus both storage buckets that were waiting on SUPABASE_DB_URL.
-- ============================================================================
-- Paste this entire file into the Supabase SQL editor and Run.
--
-- Covers, in safe dependency order:
--   1. TIM-1541 paused-status enum + columns        (file already on main)
--   2. TIM-1623 affiliate_applications              (file already on main)
--   3. TIM-1741 account localization settings        (branch feat/tim-1741-currency-settings)
--   4. TIM-1825 trial_credits_granted + ledger type  (branch feat/tim-1825-trial-credit-grant)
--   5. TIM-1700 brand_config + shop-brand-logos      (branch feat/tim-1700-brand-config)
--   6. TIM-1910 invoices + platform_settings         (branch feat/tim-1912-invoices)
--   7. Storage buckets: shop-brand-logos, invoices   (created via storage.buckets INSERT)
--   8. schema_migrations bookkeeping rows so check-migration-drift.mjs stays
--      green when each of those files lands on main.
--
-- Properties:
--   - Idempotent — every CREATE wrapped with IF NOT EXISTS or DROP-then-CREATE
--     guards; constraint mutations use DO blocks. Safe to re-run.
--   - No destructive ops on existing data.
--   - The TIM-1741 and TIM-1825 source files currently share filename version
--     20260602000000. We register them with distinct bookkeeping versions
--     here (1825 bumped to 20260602000001) so drift-CI can resolve cleanly
--     once those file owners rename. See note at the end.
-- ============================================================================


-- ── 1. TIM-1541 paused status (file 20260531225556_tim1541_paused_status.sql)
do $$
begin
  alter table public.users drop constraint if exists users_subscription_status_check;
  alter table public.users
    add constraint users_subscription_status_check
    check (subscription_status in ('free_trial','active','cancelled','expired','paused'));

  alter table public.subscriptions drop constraint if exists subscriptions_status_check;
  alter table public.subscriptions
    add constraint subscriptions_status_check
    check (status in ('active','cancelled','past_due','trialing','paused'));
end$$;

alter table public.subscriptions
  add column if not exists paused_from_tier text null,
  add column if not exists paused_at        timestamptz null;


-- ── 2. TIM-1623 affiliate_applications (file 20260601034130_affiliate_applications.sql)
create table if not exists public.affiliate_applications (
  id                           uuid        primary key default gen_random_uuid(),
  first_name                   text        not null,
  last_name                    text        not null,
  email                        text        not null,
  business_name                text        not null,
  role                         text        not null,
  role_other                   text,
  platform_audience            text        not null,
  why_referring                text        not null,
  affiliate_agreement_accepted boolean     not null default false,
  casl_consent_accepted        boolean     not null default false,
  casl_consent_at              timestamptz,
  casl_consent_ip              text,
  status                       text        not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table public.affiliate_applications enable row level security;

drop policy if exists "No direct access" on public.affiliate_applications;
create policy "No direct access" on public.affiliate_applications
  as restrictive for all using (false);

create index if not exists idx_affiliate_applications_email   on public.affiliate_applications (email);
create index if not exists idx_affiliate_applications_status  on public.affiliate_applications (status);
create index if not exists idx_affiliate_applications_created on public.affiliate_applications (created_at desc);


-- ── 3. TIM-1741 account localization settings (file 20260602000000_tim1741_account_localization_settings.sql)
alter table public.users
  add column if not exists currency_code text,
  add column if not exists localization jsonb not null default '{}'::jsonb;

comment on column public.users.currency_code is
  'ISO 4217 platform currency for this account. NULL = USD (default behavior). TIM-1741.';
comment on column public.users.localization is
  'Localization preferences: dateFormat, numberFormat, timezone, fiscalYearStartMonth. TIM-1741.';


-- ── 4. TIM-1825 trial credit grant (file 20260602000000_tim1825_trial_credit_grant.sql — see note)
alter table public.users
  add column if not exists trial_credits_granted boolean not null default false;

do $$
begin
  alter table public.credit_transactions drop constraint if exists credit_transactions_type_check;
  alter table public.credit_transactions
    add constraint credit_transactions_type_check
    check (type in ('monthly_allocation','purchase','usage','trial_grant'));
end$$;


-- ── 5. TIM-1700 brand_config + shop-brand-logos (file 20260602120000_tim1700_brand_config.sql)
create table if not exists public.brand_config (
  plan_id          uuid primary key references public.coffee_shop_plans(id) on delete cascade,
  logo_path        text,
  primary_color    text,
  accent_color     text,
  ink_color        text,
  paper_color      text,
  muted_color      text,
  rule_color       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.brand_config enable row level security;

drop policy if exists "brand_config_owner_select" on public.brand_config;
create policy "brand_config_owner_select" on public.brand_config for select
  using (plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid()));
drop policy if exists "brand_config_owner_insert" on public.brand_config;
create policy "brand_config_owner_insert" on public.brand_config for insert
  with check (plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid()));
drop policy if exists "brand_config_owner_update" on public.brand_config;
create policy "brand_config_owner_update" on public.brand_config for update
  using (plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid()));
drop policy if exists "brand_config_owner_delete" on public.brand_config;
create policy "brand_config_owner_delete" on public.brand_config for delete
  using (plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid()));


-- ── 6. TIM-1910 invoices + platform_settings (file 20260603000000_tim1910_invoices.sql)
create table if not exists public.platform_settings (
  id               integer primary key default 1 check (id = 1),
  gst_registered   boolean not null default false,
  gst_number       text,
  business_name    text not null default 'Timberline Coffee School Inc.',
  business_address jsonb,
  updated_at       timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  stripe_invoice_id     text not null unique,
  stripe_charge_id      text,
  invoice_number        text not null,
  status                text not null
    check (status in ('paid','refunded','void','uncollectible')),
  amount_subtotal_cents integer not null,
  amount_tax_cents      integer not null default 0,
  amount_total_cents    integer not null,
  currency              text not null,
  tax_jurisdiction      text,
  tax_rate_bps          integer,
  period_start          timestamptz,
  period_end            timestamptz,
  description           text not null,
  billing_address       jsonb,
  pdf_storage_path      text,
  pdf_generated_at      timestamptz,
  invoice_date          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);
create index if not exists invoices_user_id_idx on public.invoices (user_id, invoice_date desc);
alter table public.invoices enable row level security;

drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices for select using (auth.uid() = user_id);


-- ── 7. Storage buckets (shop-brand-logos + invoices) ─────────────────────────
-- Created via SQL so no Supabase dashboard UI step is required.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-brand-logos','shop-brand-logos',false,2097152,
  array['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices','invoices',false,10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- shop-brand-logos object RLS (files namespaced by plan id as first folder)
drop policy if exists "shop_brand_logos_owner_select" on storage.objects;
create policy "shop_brand_logos_owner_select" on storage.objects for select
  using (
    bucket_id = 'shop-brand-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coffee_shop_plans where user_id = auth.uid()
    )
  );
drop policy if exists "shop_brand_logos_owner_insert" on storage.objects;
create policy "shop_brand_logos_owner_insert" on storage.objects for insert
  with check (
    bucket_id = 'shop-brand-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coffee_shop_plans where user_id = auth.uid()
    )
  );
drop policy if exists "shop_brand_logos_owner_update" on storage.objects;
create policy "shop_brand_logos_owner_update" on storage.objects for update
  using (
    bucket_id = 'shop-brand-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coffee_shop_plans where user_id = auth.uid()
    )
  );
drop policy if exists "shop_brand_logos_owner_delete" on storage.objects;
create policy "shop_brand_logos_owner_delete" on storage.objects for delete
  using (
    bucket_id = 'shop-brand-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coffee_shop_plans where user_id = auth.uid()
    )
  );

-- invoices object RLS — owners read only; writes are service-role only.
drop policy if exists "invoices_owner_read" on storage.objects;
create policy "invoices_owner_read" on storage.objects for select
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── 8. schema_migrations bookkeeping ─────────────────────────────────────────
-- Keeps scripts/check-migration-drift.mjs green when each repo file lands on
-- main. Versions reflect committed filenames; TIM-1825 is bumped to ...0001
-- to avoid a same-version collision with TIM-1741 (note below).
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260531225556','tim1541_paused_status'),
  ('20260601034130','affiliate_applications'),
  ('20260602000000','tim1741_account_localization_settings'),
  ('20260602000001','tim1825_trial_credit_grant'),
  ('20260602120000','tim1700_brand_config'),
  ('20260603000000','tim1910_invoices')
on conflict (version) do nothing;

-- ── NOTE on TIM-1825 version collision ──────────────────────────────────────
-- The source file at supabase/migrations/20260602000000_tim1825_trial_credit_grant.sql
-- (on branch feat/tim-1825-trial-credit-grant) collides with TIM-1741's filename.
-- This bundle registers TIM-1825 as 20260602000001 in schema_migrations. The file
-- owner should rename their file to 20260602000001_tim1825_trial_credit_grant.sql
-- before merging to main, otherwise check-migration-drift.mjs will hard-fail on
-- "name mismatch" for the 20260602000000 version. Tracked separately.

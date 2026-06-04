-- TIM-1912: Invoice data model — Alberta-compliant PDF invoices.
-- DO NOT apply manually — CEO applies this under TIM-1914 once SUPABASE_DB_URL lands.

-- ── platform_settings (single-row, holds gstRegistered flag) ─────────────────
create table if not exists public.platform_settings (
  id               integer primary key default 1 check (id = 1),
  gst_registered   boolean not null default false,
  gst_number       text,
  business_name    text not null default 'Timberline Coffee School Inc.',
  business_address jsonb,
  updated_at       timestamptz not null default now()
);
-- Seed the one-and-only row (idempotent)
insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

-- ── invoices ──────────────────────────────────────────────────────────────────
create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  stripe_invoice_id     text not null unique,       -- Stripe "in_xxx"
  stripe_charge_id      text,                       -- nullable for $0 invoices
  invoice_number        text not null,              -- mirrors stripe.invoice.number
  status                text not null
    check (status in ('paid', 'refunded', 'void', 'uncollectible')),
  amount_subtotal_cents integer not null,
  amount_tax_cents      integer not null default 0,
  amount_total_cents    integer not null,
  currency              text not null,              -- 'cad' (lower-case, matches Stripe)
  tax_jurisdiction      text,                       -- 'AB', 'ON', … or null (zero-rated)
  tax_rate_bps          integer,                    -- 500 = 5%, 1300 = 13%, 0 = zero-rated
  period_start          timestamptz,
  period_end            timestamptz,
  description           text not null,
  billing_address       jsonb,                      -- snapshot at time of charge
  pdf_storage_path      text,                       -- '<user_id>/<invoice_number>.pdf'
  pdf_generated_at      timestamptz,
  invoice_date          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index invoices_user_id_idx on public.invoices (user_id, invoice_date desc);

-- RLS: owners can read their own invoices; writes come from service-role only.
alter table public.invoices enable row level security;

create policy invoices_owner_read
  on public.invoices
  for select
  using (auth.uid() = user_id);

-- Storage bucket is created by CEO in TIM-1914 via Supabase dashboard/MCP.
-- Bucket name: invoices, private (no public access).
-- Path scheme: <user_id>/<invoice_number>.pdf
-- Retention: indefinite (CRA requires 6-year minimum).

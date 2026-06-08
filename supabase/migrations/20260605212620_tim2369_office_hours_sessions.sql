-- TIM-2369: Office Hours backing table — Phase 2F of TIM-1952.
-- Pro-only SELECT (authenticated). meet_link/recording_url must never reach
-- Starter or anonymous visitors. Writes are service-role only (no policies),
-- matching the support_messages / admin_audit_log pattern.
--
-- Standing Rule 1: RLS enabled with deny-by-default — only the Pro SELECT
-- policy below is created; INSERT/UPDATE/DELETE are exclusively service-role.
--
-- Introduces public.is_pro(uuid) as the canonical SECURITY DEFINER helper for
-- all Pro-gated RLS policies (Phase 2 will add more). Mirrors the TypeScript
-- effectivePlanForGating() rules in src/lib/access.ts:
--   • subscription_tier = 'pro'  AND subscription_status = 'active'
--   • subscription_status = 'paused' AND paused_from_tier = 'pro'        (read-only)
--   • subscription_status = 'free_trial' AND trial_ends_at > now()      (7-day card-backed trial → Pro)

create extension if not exists "pgcrypto";

-- ── 1. is_pro(uuid) helper ────────────────────────────────────────────────────
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.users u
     where u.id = uid
       and (
            (u.subscription_tier = 'pro' and u.subscription_status = 'active')
         or (u.subscription_status = 'paused' and u.paused_from_tier = 'pro')
         or (u.subscription_status = 'free_trial'
             and u.trial_ends_at is not null
             and u.trial_ends_at > now())
       )
  );
$$;

revoke all on function public.is_pro(uuid) from public;
grant execute on function public.is_pro(uuid) to authenticated;

comment on function public.is_pro(uuid) is
  'TIM-2369: canonical Pro-tier predicate for RLS. Mirrors effectivePlanForGating() in src/lib/access.ts. SECURITY DEFINER reads public.users on behalf of the calling auth.uid().';

-- ── 2. office_hours_sessions table ────────────────────────────────────────────
create table if not exists public.office_hours_sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  scheduled_at  timestamptz not null,
  meet_link     text,
  recording_url text,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists office_hours_sessions_scheduled_at_idx
  on public.office_hours_sessions (scheduled_at desc);

alter table public.office_hours_sessions enable row level security;

-- ── 3. RLS: Pro-only SELECT ───────────────────────────────────────────────────
drop policy if exists office_hours_sessions_pro_select on public.office_hours_sessions;
create policy office_hours_sessions_pro_select
  on public.office_hours_sessions
  for select
  to authenticated
  using ( public.is_pro(auth.uid()) );

-- No INSERT/UPDATE/DELETE policies — writes happen via the service-role client.

comment on table public.office_hours_sessions is
  'TIM-2369: Pro-only office hours sessions. RLS gates SELECT through public.is_pro(auth.uid()). Writes are service-role only.';

-- ── 4. Seed first session ─────────────────────────────────────────────────────
insert into public.office_hours_sessions (title, scheduled_at, meet_link)
select
  'Office Hours Q&A — Jun 9',
  '2026-06-09T16:00:00Z'::timestamptz,
  'https://meet.google.com/wgm-vrtg-gwd'
where not exists (
  select 1
    from public.office_hours_sessions
   where scheduled_at = '2026-06-09T16:00:00Z'::timestamptz
);

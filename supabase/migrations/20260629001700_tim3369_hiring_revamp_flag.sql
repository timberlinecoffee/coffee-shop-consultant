-- TIM-3369: Hiring & Onboarding IA restructure (left nav of roles + role page
-- with accordion sections) ships behind a per-user revert flag. Default false
-- so existing users keep seeing the TIM-3355 inline-expand list until the
-- board explicitly opts in (Preferences toggle or ?hiring=v2). Backfill flips
-- to true via a follow-up migration after the 14-day revert window per the
-- TIM-2993 / SA-2 default-flip pattern.

alter table public.users
  add column if not exists hiring_revamp_v2 boolean not null default false;

comment on column public.users.hiring_revamp_v2 is
  'TIM-3369 — feature flag for the Hiring & Onboarding workspace v2 IA (left nav of roles + accordion role page). Default false during revert window; SA-2 backfilled to true post-window.';

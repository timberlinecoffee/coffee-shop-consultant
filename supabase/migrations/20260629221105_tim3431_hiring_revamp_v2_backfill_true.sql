-- TIM-3431: flip Hiring & Onboarding v2 IA (TIM-3369) to default-true.
-- Mirrors the TIM-2993 ui_revamp_v2 pattern, accelerated past the 14-day SA-2
-- floor by board directive in the TIM-3431 issue body — board commented on
-- TIM-3354 that they were not seeing the v2 surface (their account hadn't
-- opted in) and explicitly authorized SA-1/SA-2/SA-Deploy self-apply on this
-- issue. RevertToggle in Preferences (HiringRevertToggle, TIM-3369) remains
-- so any user can still write hiring_revamp_v2=false individually.
--
-- Lifecycle:
--   TIM-3369 — column created NOT NULL DEFAULT false, ships behind ?hiring=v2
--              override + RevertToggle opt-in during the revert window.
--   TIM-3431 — every existing false row backfilled true; DEFAULT flipped to
--              true so new signups also land on v2.

ALTER TABLE public.users
  ALTER COLUMN hiring_revamp_v2 SET DEFAULT true;

UPDATE public.users
   SET hiring_revamp_v2 = true,
       updated_at        = now()
 WHERE hiring_revamp_v2 IS NOT TRUE;

COMMENT ON COLUMN public.users.hiring_revamp_v2 IS
  'TIM-3369 — feature flag for the Hiring & Onboarding workspace v2 IA (left nav of roles + accordion role page). Default true post-TIM-3431; existing false rows backfilled to true in TIM-3431 per board directive on TIM-3354 / TIM-3431. Overridable via ?hiring=v1/?hiring=v2 URL param (session/cookie only, no DB write) or HiringRevertToggle in Preferences (PATCH /api/account/hiring-revamp writes the DB column).';

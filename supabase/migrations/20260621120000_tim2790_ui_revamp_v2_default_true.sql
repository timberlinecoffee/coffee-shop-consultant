-- TIM-2790 (BP V2 IA flag flip): set DEFAULT TRUE on users.ui_revamp_v2 so all
-- new signups land on the V2 Information Architecture confirmed by the board
-- on preview (TIM-2759 request_confirmation accepted 2026-06-20).
--
-- Lifecycle so far:
--   TIM-2589 — column created NOT NULL DEFAULT true.
--   TIM-2598 — flipped DEFAULT to false + backfilled all 46 rows to false so
--              v1 stayed untouched while v2 baked behind ?ui=v2 override.
--   TIM-2790 — board confirmed V2 IA on preview; flip DEFAULT back to true
--              for new signups. NO UPDATE on existing rows: anyone explicitly
--              false (TIM-2598 backfill or RevertToggle opt-out) keeps v1.
--              Existing accounts opt into v2 via Preferences toggle or
--              ?ui=v2 override cookie.
--
-- This is intentionally one DDL statement. Adding an UPDATE would back-fill
-- TIM-2598's explicit opt-outs and break the staged-rollout contract.

ALTER TABLE public.users ALTER COLUMN ui_revamp_v2 SET DEFAULT true;

COMMENT ON COLUMN public.users.ui_revamp_v2 IS
  'Feature flag: true renders the revamped v2 UI surfaces (TIM-2759 IA), false falls back to v1. Default flipped to true for new signups in TIM-2790 after board preview confirmation. Existing rows preserved at their prior value. Overridable via ?ui=v1 or ?ui=v2 URL param (session/cookie only, no DB write).';

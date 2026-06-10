-- TIM-2598 (Phase 5.0 prod merge): flip ui_revamp_v2 default to false so existing
-- and new users see v1 untouched. Board (trentrollings@gmail.com) opts in by
-- visiting any app URL with ?ui=v2 once (persistent 365d override cookie) OR
-- by flipping the RevertToggle in Preferences (writes ui_revamp_v2=true).
--
-- Per board lock #3 (TIM-2598 description): "Flag defaults to false in prod.
-- Anonymous + every existing user keeps seeing v1 untouched. Only the board's
-- account (and any other explicitly opted-in account) sees v2."
--
-- TIM-2589 originally set DEFAULT true; this rolls all 46 existing rows back to
-- false and changes the column default for new signups. v1 code path remains
-- intact in main; no surfaces are deleted.

ALTER TABLE public.users ALTER COLUMN ui_revamp_v2 SET DEFAULT false;

UPDATE public.users SET ui_revamp_v2 = false WHERE ui_revamp_v2 IS TRUE;

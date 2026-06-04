-- TIM-1614: Close anon-key RLS holes on three PostgREST-reachable tables.
--
-- Source: TIM-1612 audit F3 + CEO Path 2 discovery (2026-06-04). The original
-- finding targeted an `events` table from the calendar embed; that table does
-- not exist in `coffee-shop-consultant` (ltmcttjftxzpgynhnrpg). Discovery
-- surfaced three real exposures instead — all currently RLS-off with full
-- anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE GRANTs:
--
--   1) stripe_processed_events   (CRITICAL)
--      Stripe webhook idempotency table. Anon can pre-insert future
--      event IDs to suppress legitimate webhooks → silent billing breakage.
--
--   2) business_plan_sections_archive   (HIGH)
--      Customer plan PII snapshot (TIM-1498 defensive archive). Anon read =
--      PII exfiltration; anon write = tampering of audit/rollback data.
--
--   3) equipment_referrals   (HIGH)
--      Affiliate / partner referral links (TIM-1179). Anon write = forged or
--      wiped referral data tied to affiliate payouts (TIM-1604).
--
-- Fix pattern: enable RLS + REVOKE ALL from anon, authenticated. All three
-- tables are only reached by service_role code paths (Stripe webhook,
-- admin routes, account-deletion cron). service_role bypasses RLS by design,
-- so the deny-by-default policy-less stance is the complete fix — mirrors
-- the existing `admin_audit_log` and `platform_settings` pattern.
--
-- Standing Rule 1 ([TIM-2252]) — RLS deny-by-default — applied retroactively.

BEGIN;

-- 1) stripe_processed_events
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_processed_events FROM anon;
REVOKE ALL ON public.stripe_processed_events FROM authenticated;

-- 2) business_plan_sections_archive
ALTER TABLE public.business_plan_sections_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_plan_sections_archive FROM anon;
REVOKE ALL ON public.business_plan_sections_archive FROM authenticated;

-- 3) equipment_referrals
ALTER TABLE public.equipment_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipment_referrals FROM anon;
REVOKE ALL ON public.equipment_referrals FROM authenticated;

COMMIT;

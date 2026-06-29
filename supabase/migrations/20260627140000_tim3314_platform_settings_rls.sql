-- TIM-3314: Enable RLS on platform_settings — §1 audit launch blocker.
--
-- platform_settings holds gst_number, business_address, business_name —
-- the fields that feed Alberta-compliant invoice PDFs. The table was created
-- in 20260603000000_tim1910_invoices.sql without enabling RLS, leaving a full
-- anon + authenticated read/write path open via the PostgREST API.
--
-- Two later migrations (tim1614:25, tim2304:34) documented platform_settings
-- as already following the service-role-only pattern, but the actual DDL was
-- never applied. This migration closes the gap.
--
-- Pattern: service-role-only (RLS on, no policies, REVOKE ALL from public
-- roles). Mirrors admin_audit_log, auth_users_audit, stripe_processed_events,
-- business_plan_sections_archive, and equipment_referrals.
--
-- service_role uses BYPASSRLS, so invoice generation (already using the
-- service client) is unaffected.
--
-- Standing Rule 1 (TIM-2252) — RLS deny-by-default.
-- Security Officer sign-off required before merge (see TIM-3314).
--
-- VERSION NOTE: This file was authored without the Supabase CLI. The filename
-- version (20260627140000) is a real wall-clock timestamp (2026-06-27 14:00 UTC).
-- CTO must confirm or rename to match the server-assigned version from
-- schema_migrations after apply_migration, per supabase/migrations/README.md.

BEGIN;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
-- No policies: service_role (BYPASSRLS) retains full read/write access.

COMMIT;

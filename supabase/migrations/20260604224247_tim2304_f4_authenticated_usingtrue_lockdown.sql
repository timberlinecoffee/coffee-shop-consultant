-- TIM-2304: F4 follow-up — tighten the five public tables whose authenticated
-- policies grant blanket USING (true) access. Spun out of TIM-1614 CEO discovery
-- (2026-06-04). Lower priority than the TIM-1614 anon-CRUD holes (exposure here
-- was login-gated, not anon) but still a Standing Rule 1 (deny-by-default)
-- violation: the underlying tables still carried the default anon + authenticated
-- INSERT/UPDATE/DELETE/TRUNCATE GRANTs, so any future stray permissive policy
-- would silently open writes.
--
-- Tables in scope:
--   public.auth_users_audit
--   public.onboarding_plan_templates
--   public.org_role_templates
--   public.pricing_benchmarks
--   public.standard_equipment_reference
--
-- ── Part A — read-only reference/seed tables ────────────────────────────────
-- onboarding_plan_templates, org_role_templates, pricing_benchmarks,
-- standard_equipment_reference are reference/seed data every logged-in user
-- reads. Keep the authenticated SELECT policy (USING true); strip every WRITE
-- privilege from anon + authenticated. Writes remain service_role-only
-- (service_role has BYPASSRLS; pricing_benchmarks + standard_equipment_reference
-- additionally keep an explicit service_role write policy). anon has no read
-- policy on these tables, so its SELECT grant is dead — drop it too (least
-- privilege). No functional impact: writes were already RLS-blocked and anon
-- reads were already policy-blocked; this closes the GRANT layer.
--
-- ── Part B — auth_users_audit → service_role-only ───────────────────────────
-- auth_users_audit is a PII / security-audit log (target_email, actor_ip,
-- actor_jwt_sub, source_ip, auth-change history). It has NO row-owner column —
-- target/actor are admin-op subjects, not the row's owner — so auth.uid()
-- scoping is meaningless. Before this migration the authenticated_read_only
-- policy (USING true) let ANY logged-in user read every user's email + IP +
-- auth-change history. Switch to service_role-only, mirroring admin_audit_log /
-- platform_settings: RLS on, no anon/authenticated policy, REVOKE ALL from
-- anon + authenticated. service_role (BYPASSRLS) retains full access.
--
-- Standing Rule 1 ([TIM-2252]) — RLS deny-by-default — applied retroactively.

BEGIN;

-- ── Part A: read-only reference/seed tables ────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.onboarding_plan_templates FROM anon, authenticated;
REVOKE SELECT ON public.onboarding_plan_templates FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.org_role_templates FROM anon, authenticated;
REVOKE SELECT ON public.org_role_templates FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.pricing_benchmarks FROM anon, authenticated;
REVOKE SELECT ON public.pricing_benchmarks FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.standard_equipment_reference FROM anon, authenticated;
REVOKE SELECT ON public.standard_equipment_reference FROM anon;

-- ── Part B: auth_users_audit → service_role-only ───────────────────────────
DROP POLICY IF EXISTS "authenticated_read_only" ON public.auth_users_audit;
DROP POLICY IF EXISTS "service_role_full_read" ON public.auth_users_audit;
REVOKE ALL ON public.auth_users_audit FROM anon, authenticated;

COMMIT;

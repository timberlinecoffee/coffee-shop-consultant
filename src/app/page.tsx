// TIM-3845: apex now serves the paid-signup marketing landing (board pivot
// 2026-07-14 on TIM-3844 — skip 5-invitee gate, ship public paid beta). The
// prior coming-soon waitlist gate is preserved at /coming-soon for backwards
// compat (Klaviyo source attribution + Supabase Site-URL fallback links in
// existing OAuth cookies). The landing page now carries the OAuth forwarder
// (see src/app/landing/page.tsx TIM-3845 block) so `?code=`/`?error=` on
// apex still forwards to /auth/callback.
//
// TIM-3011: force-dynamic so Next.js/Turbopack does not attempt to statically
// render this route at build time. The landing page reads searchParams which
// is a dynamic API; without this export the re-export chain can hide that
// dynamic usage from Turbopack's static analysis, causing a build-time render
// attempt that crashes outside a request scope (500).
export const dynamic = 'force-dynamic';
export { default, metadata } from "./landing/page";

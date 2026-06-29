// TIM-2288: apex now serves the Groundwork.AI coming-soon page (board decision
// 2026-06-04). Marketing landing preserved at /landing. The coming-soon page is
// the public face; /coming-soon stays accessible for backwards-compat (any
// existing links in emails / Klaviyo source attribution).
//
// TIM-3011: force-dynamic so Next.js/Turbopack does not attempt to statically
// render this route at build time. The component calls cookies() via
// createClient(); without this export the re-export chain can hide that
// dynamic-API usage from Turbopack's static analysis, causing a build-time
// render attempt that crashes on cookies() outside a request scope (500).
export const dynamic = 'force-dynamic';
export { default, metadata } from "./coming-soon/page";

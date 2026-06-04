// TIM-2288: apex now serves the Groundwork.AI coming-soon page (board decision
// 2026-06-04). Marketing landing preserved at /landing. The coming-soon page is
// the public face; /coming-soon stays accessible for backwards-compat (any
// existing links in emails / Klaviyo source attribution).
export { default, metadata } from "./coming-soon/page";

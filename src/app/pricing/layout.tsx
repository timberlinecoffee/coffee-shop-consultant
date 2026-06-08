// TIM-2307: pricing page is a client component (uses useSearchParams), so we
// inject the SEO/browser-tab title from a co-located layout. Before this, the
// tab showed the root layout's catch-all "My Coffee Shop Consultant" title,
// which read as "homepage" to bio-link visitors.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Groundwork",
  description:
    "Starter and Pro plans, 7-day free trial, cancel anytime. Annual saves 20%.",
  openGraph: {
    title: "Pricing — Groundwork",
    description:
      "Starter and Pro plans, 7-day free trial, cancel anytime. Annual saves 20%.",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

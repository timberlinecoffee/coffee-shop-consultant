"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConsent } from "@/lib/consent/useConsent";

/**
 * Cookie consent banner (TIM-1835). Shown until the visitor makes a choice.
 * "Accept All" enables analytics and marketing; "Necessary Only" keeps tracking
 * off. Reject is one click and equally prominent (GDPR). The decision gates
 * whether tracking scripts load; see TrackingScripts.
 *
 * TIM-3284: the SSR HTML always renders this element. A pre-hydration script
 * in `src/app/layout.tsx` adds `data-consent-decided` on `<html>` when the
 * cookie is present, and the CSS rule in `globals.css` hides the banner via
 * `[data-consent-decided] [data-consent-banner]`. This way the banner stays
 * hidden on returning visits independent of how fast React hydration runs, and
 * we don't have to opt every route into dynamic rendering (which kills
 * Lighthouse perf on the marketing pages).
 *
 * Tokens and components per the Groundwork style guide (Banners, Buttons).
 */
export function CookieConsentBanner() {
  const { decided, acceptAll, rejectNonEssential } = useConsent();
  const pathname = usePathname();

  // Never show on print/export views.
  if (pathname?.includes("/print")) return null;
  if (decided) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      data-consent-banner
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6"
    >
      <div className="max-w-3xl mx-auto bg-white border border-[var(--border)] rounded-2xl shadow-lg p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-[var(--foreground)] leading-relaxed flex-1">
          We use cookies to keep Groundwork running and, with your consent, to measure our
          advertising and understand how the site is used. You can change your choice anytime in our{" "}
          <Link href="/privacy" className="text-[var(--teal)] underline">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button variant="outline" size="lg" onClick={rejectNonEssential}>
            Necessary Only
          </Button>
          <Button variant="outline" size="lg" onClick={acceptAll}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}

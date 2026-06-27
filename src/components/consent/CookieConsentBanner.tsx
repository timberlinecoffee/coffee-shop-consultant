"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ConsentState } from "@/lib/consent/consent";
import { useConsent } from "@/lib/consent/useConsent";

/**
 * Cookie consent banner (TIM-1835). Shown until the visitor makes a choice.
 * "Accept All" enables analytics and marketing; "Necessary Only" keeps tracking
 * off. Reject is one click and equally prominent (GDPR). The decision gates
 * whether tracking scripts load; see TrackingScripts.
 *
 * TIM-3284: `initialConsent` comes from a server-side read of the `gw_consent`
 * cookie in `src/app/layout.tsx`. Passing it lets the SSR HTML render the
 * correct decided state immediately, so the banner does not appear in the
 * served markup for returning visitors. Previously the SSR snapshot was always
 * `null`, the banner was always in the HTML, and we relied on client hydration
 * reading `document.cookie` to hide it — fragile under any condition that
 * delays or breaks hydration.
 *
 * Tokens and components per the Groundwork style guide (Banners, Buttons).
 */
export function CookieConsentBanner({
  initialConsent = null,
}: {
  initialConsent?: ConsentState | null;
}) {
  const { decided, acceptAll, rejectNonEssential } = useConsent(initialConsent);
  const pathname = usePathname();

  // Never show on print/export views.
  if (pathname?.includes("/print")) return null;
  if (decided) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
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

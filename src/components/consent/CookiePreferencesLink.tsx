"use client";

import type { CSSProperties } from "react";
import { resetConsent } from "@/lib/consent/consent";

/**
 * "Cookie Preferences" footer link (TIM-1853). GDPR Art. 7(3) requires consent
 * withdrawal to be as easy as giving it, so this persistent link clears the
 * gw_consent cookie and re-shows the CookieConsentBanner (which renders whenever
 * decided === false). Rendered as a <button> because it triggers an action rather
 * than navigating; pass `className` so each footer matches its own link styling.
 */
export function CookiePreferencesLink({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button type="button" onClick={() => resetConsent()} className={className} style={style}>
      Cookie Preferences
    </button>
  );
}

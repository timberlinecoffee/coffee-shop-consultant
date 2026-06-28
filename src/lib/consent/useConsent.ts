"use client";

import { useSyncExternalStore } from "react";
import {
  type ConsentState,
  subscribeConsent,
  getConsentSnapshot,
  getConsentServerSnapshot,
  acceptAll as acceptAllConsent,
  rejectNonEssential as rejectNonEssentialConsent,
} from "./consent";

type UseConsent = {
  /** Current decision, or null if the visitor has not decided yet. */
  consent: ConsentState | null;
  /** True when a decision exists (banner should be hidden). */
  decided: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
};

/**
 * Read consent reactively. The banner and the gated tracking loader share this
 * store, so a decision in one updates the other in the same tick. The client
 * snapshot reads the cookie synchronously on first render, so there is no flash
 * for visitors who have already chosen.
 *
 * TIM-3284: SSR-visible suppression of the banner element for returning visitors
 * happens via the pre-hydration script in `src/app/layout.tsx` + the
 * `[data-consent-decided] [data-consent-banner]` CSS rule in `globals.css`. The
 * banner element stays in the React tree; CSS hides it before paint. React
 * state still owns the Accept-All / Reject / Cookie-Preferences flow once
 * hydration completes.
 */
export function useConsent(): UseConsent {
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  return {
    consent,
    decided: consent !== null,
    acceptAll: () => acceptAllConsent(),
    rejectNonEssential: () => rejectNonEssentialConsent(),
  };
}

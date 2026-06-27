"use client";

import { useMemo, useSyncExternalStore } from "react";
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
 * store, so a decision in one updates the other in the same tick.
 *
 * TIM-3284: when the server already read the cookie (passed in via
 * `initialConsent`), use that as the SSR snapshot so the rendered HTML matches
 * what the client will see post-hydration. Without this, the SSR snapshot is
 * always null and the banner is always present in the served HTML — anything
 * that delays or breaks client hydration (browser extension touching
 * document.cookie, slow JS, hydration error) leaves the banner visible even
 * though the visitor accepted on a prior visit.
 */
export function useConsent(initialConsent: ConsentState | null = null): UseConsent {
  const serverSnapshot = useMemo(
    () => (initialConsent === null ? getConsentServerSnapshot : () => initialConsent),
    [initialConsent],
  );
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, serverSnapshot);

  return {
    consent,
    decided: consent !== null,
    acceptAll: () => acceptAllConsent(),
    rejectNonEssential: () => rejectNonEssentialConsent(),
  };
}

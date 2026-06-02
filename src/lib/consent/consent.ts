/**
 * Cookie consent state: single source of truth for whether tracking may run.
 *
 * Gating model (TIM-1835): no Meta Pixel, Conversions API, GA4, or Google Ads tag
 * may load or fire until the visitor has made a choice and granted the relevant
 * category. Consent is stored in a first-party cookie so both the browser (script
 * gating) and the server (CAPI gating) can read the same decision.
 *
 * Categories:
 *   - necessary: always on (auth, security, preferences). Not gated, not stored here.
 *   - analytics: GA4 / product analytics.
 *   - marketing: Meta Pixel + Conversions API, Google Ads. Ad measurement.
 *
 * "Necessary only" (reject) sets both analytics and marketing to false.
 */

export const CONSENT_COOKIE = "gw_consent";
export const CONSENT_VERSION = 1;
// 12 months, the conventional consent lifetime before we must re-ask.
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
// Dispatched on the window after any consent write so gated scripts re-evaluate.
export const CONSENT_CHANGE_EVENT = "gw-consent-change";

export type ConsentState = {
  version: number;
  analytics: boolean;
  marketing: boolean;
  /** ISO timestamp of the decision. */
  decidedAt: string;
};

export const ACCEPT_ALL: Omit<ConsentState, "decidedAt"> = {
  version: CONSENT_VERSION,
  analytics: true,
  marketing: true,
};

export const NECESSARY_ONLY: Omit<ConsentState, "decidedAt"> = {
  version: CONSENT_VERSION,
  analytics: false,
  marketing: false,
};

/**
 * Parse a raw cookie value into consent state. Returns null when absent,
 * unparseable, or from an older consent version (so we re-ask on policy changes).
 * Safe to call on the server (CAPI gate) takes the raw string, no document access.
 */
export function parseConsentCookie(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentState>;
    if (parsed?.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : "",
    };
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(state: ConsentState | null): boolean {
  return state?.analytics === true;
}

export function hasMarketingConsent(state: ConsentState | null): boolean {
  return state?.marketing === true;
}

/* ----------------------------- client helpers ----------------------------- */

function readConsentCookieRaw(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  return match?.slice(CONSENT_COOKIE.length + 1);
}

/** Read the current decision from the browser. null = not decided yet. */
export function readConsent(): ConsentState | null {
  return parseConsentCookie(readConsentCookieRaw());
}

/** Persist a decision to the first-party cookie and notify gated scripts. */
export function writeConsent(choice: Omit<ConsentState, "decidedAt">): ConsentState {
  const state: ConsentState = { ...choice, decidedAt: new Date().toISOString() };
  if (typeof document !== "undefined") {
    const value = encodeURIComponent(JSON.stringify(state));
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: state }));
  }
  return state;
}

export function acceptAll(): ConsentState {
  return writeConsent(ACCEPT_ALL);
}

export function rejectNonEssential(): ConsentState {
  return writeConsent(NECESSARY_ONLY);
}

/**
 * Withdraw a prior decision (GDPR Art. 7(3): withdrawal as easy as consent).
 * Deletes the consent cookie and notifies subscribers, which re-shows the banner
 * (decided returns to false) and stops gated tracking from re-firing. Wired to the
 * "Cookie Preferences" footer link.
 */
export function resetConsent(): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: null }));
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function subscribeConsent(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGE_EVENT, cb);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, cb);
}

/**
 * Stable snapshot for useSyncExternalStore. We recompute the parsed object only
 * when the raw cookie string changes, so React gets a referentially stable value
 * between renders (a fresh parse every call would loop).
 */
let snapshotCache: { raw: string | undefined; value: ConsentState | null } = {
  raw: undefined,
  value: null,
};
let snapshotInitialized = false;

export function getConsentSnapshot(): ConsentState | null {
  const raw = readConsentCookieRaw();
  if (!snapshotInitialized || raw !== snapshotCache.raw) {
    snapshotCache = { raw, value: parseConsentCookie(raw) };
    snapshotInitialized = true;
  }
  return snapshotCache.value;
}

/** Server render has no cookie access; treat as "not decided" until hydration. */
export function getConsentServerSnapshot(): ConsentState | null {
  return null;
}

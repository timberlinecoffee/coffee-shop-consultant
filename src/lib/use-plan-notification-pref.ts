"use client";

// TIM-3253: Persistent dismiss + snooze for plan notification findings.
//
// Follows the module-scope shared-cache pattern from use-callout-dismissed.ts.
// One GET per browser session loads the full map keyed by AuditFinding.id (or
// a derived key for LaunchReadiness errors). Each dismiss/snooze optimistically
// updates local state and PUTs the updated map.
//
// Two hooks are exported:
//   usePlanNotifsMap()           — for panels that render many findings
//   useSinglePlanNotifPref()     — for single-key surfaces (LaunchReadiness error)

import { useCallback, useEffect, useState } from "react";

export const PLAN_NOTIFS_PREF_KEY = "platform.plan-notifications";

type PlanNotifPref = {
  dismissedAt?: string;   // ISO — permanent dismiss
  snoozedUntil?: string;  // ISO — re-show after this
};

type PlanNotifPrefsMap = Record<string, PlanNotifPref>;

export type PlanNotifSurface = "quality_check" | "companion" | "launch_readiness";

type LoadState = "idle" | "loading" | "ready" | "error";

const store: {
  state: LoadState;
  map: PlanNotifPrefsMap;
  loadPromise: Promise<void> | null;
  listeners: Set<() => void>;
} = {
  state: "idle",
  map: {},
  loadPromise: null,
  listeners: new Set(),
};

function emit() {
  for (const l of store.listeners) l();
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
}

async function ensureLoaded() {
  if (store.state === "ready" || store.state === "loading") return store.loadPromise ?? Promise.resolve();
  store.state = "loading";
  emit();
  store.loadPromise = (async () => {
    try {
      const res = await fetch(`/api/ui-prefs/${PLAN_NOTIFS_PREF_KEY}`, { credentials: "same-origin" });
      if (res.ok) {
        const { data } = (await res.json()) as { data: unknown };
        if (data && typeof data === "object" && !Array.isArray(data)) {
          store.map = data as PlanNotifPrefsMap;
        }
      }
      store.state = "ready";
    } catch {
      store.state = "error";
    } finally {
      emit();
    }
  })();
  return store.loadPromise;
}

async function persistMap(map: PlanNotifPrefsMap) {
  try {
    await fetch(`/api/ui-prefs/${PLAN_NOTIFS_PREF_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(map),
    });
  } catch {
    /* non-blocking; next load reconciles */
  }
}

// Debounced to batch rapid dismiss/snooze actions into one PUT, preventing
// last-writer-wins data loss when multiple findings are acted on quickly.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function setMap(next: PlanNotifPrefsMap) {
  store.map = next;
  emit();
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistMap(store.map);
    persistTimer = null;
  }, 500);
}

function fireAnalytics(eventName: string, params: Record<string, string>) {
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>)["gtag"] === "function"
  ) {
    (window as unknown as Record<string, (...args: unknown[]) => void>)["gtag"](
      "event",
      eventName,
      params,
    );
  }
}

function getPrefsState(id: string) {
  const pref = store.map[id];
  const isDismissed = Boolean(pref?.dismissedAt);
  const rawUntil = pref?.snoozedUntil ? new Date(pref.snoozedUntil) : null;
  const isSnoozed = Boolean(rawUntil && rawUntil > new Date());
  const snoozedUntil = isSnoozed ? rawUntil : null;
  return { isDismissed, isSnoozed, snoozedUntil };
}

// ── Hook for panels rendering many findings at once. ─────────────────────────

export function usePlanNotifsMap(): {
  isLoaded: boolean;
  /** Increments on every store change — include in useMemo deps to invalidate on dismiss/snooze. */
  storeVersion: number;
  getState: (id: string) => { isDismissed: boolean; isSnoozed: boolean; snoozedUntil: Date | null };
  dismiss: (id: string, surface: PlanNotifSurface) => void;
  snooze: (id: string, surface: PlanNotifSurface, hours?: number) => void;
} {
  const [storeVersion, force] = useState(0);
  useEffect(() => {
    void ensureLoaded();
    return subscribe(() => force((n) => n + 1));
  }, []);

  const isLoaded = store.state === "ready" || store.state === "error";

  const getState = useCallback((id: string) => getPrefsState(id), []);

  const dismiss = useCallback((id: string, surface: PlanNotifSurface) => {
    if (store.map[id]?.dismissedAt) return;
    setMap({ ...store.map, [id]: { ...store.map[id], dismissedAt: new Date().toISOString() } });
    fireAnalytics("plan_notification_dismissed", { surface });
  }, []);

  const snooze = useCallback((id: string, surface: PlanNotifSurface, hours = 24) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setMap({ ...store.map, [id]: { ...store.map[id], snoozedUntil: until } });
    fireAnalytics("plan_notification_snoozed", { surface, snooze_hours: String(hours) });
  }, []);

  return { isLoaded, storeVersion, getState, dismiss, snooze };
}

// ── Hook for single-key surfaces (LaunchReadiness error state). ───────────────

export function useSinglePlanNotifPref(
  findingId: string,
  surface: PlanNotifSurface,
): {
  isDismissed: boolean;
  isSnoozed: boolean;
  snoozedUntil: Date | null;
  dismiss: () => void;
  snooze: (hours?: number) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    void ensureLoaded();
    return subscribe(() => force((n) => n + 1));
  }, []);

  const { isDismissed, isSnoozed, snoozedUntil } = getPrefsState(findingId);

  const dismiss = useCallback(() => {
    if (store.map[findingId]?.dismissedAt) return;
    setMap({ ...store.map, [findingId]: { ...store.map[findingId], dismissedAt: new Date().toISOString() } });
    fireAnalytics("plan_notification_dismissed", { surface });
  }, [findingId, surface]);

  const snooze = useCallback((hours = 24) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setMap({ ...store.map, [findingId]: { ...store.map[findingId], snoozedUntil: until } });
    fireAnalytics("plan_notification_snoozed", { surface, snooze_hours: String(hours) });
  }, [findingId, surface]);

  return { isDismissed, isSnoozed, snoozedUntil, dismiss, snooze };
}

/** Test-only: reset module-level cache between tests. */
export function __resetPlanNotifStoreForTests() {
  store.state = "idle";
  store.map = {};
  store.loadPromise = null;
  store.listeners.clear();
}

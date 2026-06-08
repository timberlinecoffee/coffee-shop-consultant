// TIM-2423: client-side hook backing <DismissibleCallout>.
//
// Single shared map (`platform.dismissed-callouts`) read once per browser session
// and cached at module scope so N callouts on a page issue ONE GET, not N. Each
// dismiss optimistically updates local state, broadcasts to other mounted
// callouts, and persists via PUT.

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DISMISSED_CALLOUTS_PREF_KEY,
  isDismissedCalloutsMap,
  type CalloutKey,
  type DismissedCalloutsMap,
} from "./callouts.ts";

type LoadState = "idle" | "loading" | "ready" | "error";

const store: {
  state: LoadState;
  map: DismissedCalloutsMap;
  loadPromise: Promise<void> | null;
  listeners: Set<() => void>;
} = {
  state: "idle",
  map: {},
  loadPromise: null,
  listeners: new Set(),
};

function emit() {
  for (const listener of store.listeners) listener();
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

async function ensureLoaded() {
  if (store.state === "ready" || store.state === "loading") return store.loadPromise ?? Promise.resolve();
  store.state = "loading";
  emit();
  store.loadPromise = (async () => {
    try {
      const res = await fetch(`/api/ui-prefs/${DISMISSED_CALLOUTS_PREF_KEY}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const { data } = (await res.json()) as { data: unknown };
        if (isDismissedCalloutsMap(data)) {
          store.map = { ...data };
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

async function persist(next: DismissedCalloutsMap) {
  try {
    await fetch(`/api/ui-prefs/${DISMISSED_CALLOUTS_PREF_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(next),
    });
  } catch {
    /* non-blocking; next load reconciles */
  }
}

function setMap(next: DismissedCalloutsMap) {
  store.map = next;
  emit();
  void persist(next);
}

/**
 * Read + write a single callout's dismissal.
 *
 * - `dismissed === null` while the shared map is loading (first paint should hide).
 * - `dismissed === true` if the key is in the map.
 * - `dismissed === false` if loaded and the key is absent.
 * - `dismiss()` optimistically marks dismissed and PUTs.
 */
export function useCalloutDismissed(key: CalloutKey): {
  dismissed: boolean | null;
  dismiss: () => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    void ensureLoaded();
    return subscribe(() => force((n) => n + 1));
  }, []);

  const dismissed =
    store.state === "ready" || store.state === "error"
      ? Object.prototype.hasOwnProperty.call(store.map, key)
      : null;

  const dismiss = useCallback(() => {
    if (Object.prototype.hasOwnProperty.call(store.map, key)) return;
    setMap({ ...store.map, [key]: new Date().toISOString() });
  }, [key]);

  return { dismissed, dismiss };
}

/**
 * Read the full dismissed map + an undo function. Used by the Settings →
 * Preferences → Guided Notices surface.
 */
export function useDismissedCallouts(): {
  state: LoadState;
  map: DismissedCalloutsMap;
  resurface: (key: CalloutKey) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    void ensureLoaded();
    const unsub = subscribe(() => force((n) => n + 1));
    return unsub;
  }, []);

  const resurface = useCallback((key: CalloutKey) => {
    if (!Object.prototype.hasOwnProperty.call(store.map, key)) return;
    const next = { ...store.map };
    delete next[key];
    setMap(next);
  }, []);

  return { state: store.state, map: store.map, resurface };
}

/** Test-only: reset the module-level cache between tests. */
export function __resetCalloutStoreForTests() {
  store.state = "idle";
  store.map = {};
  store.loadPromise = null;
  store.listeners.clear();
}

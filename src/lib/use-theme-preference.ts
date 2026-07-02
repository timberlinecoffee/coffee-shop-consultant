// TIM-3569: client hook backing the Settings → Appearance theme selector.
//
// Same shape as use-callout-dismissed (TIM-2423): module-level cache so any
// mount reads/writes hit one shared store. One GET on first mount, one PUT
// per change. Apply-to-DOM is synchronous so the paint updates in the same
// frame as the click.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  THEME_PREF_KEY,
  THEME_STORAGE_KEY,
  isThemeMode,
  type ThemeMode,
} from "./theme.ts";

type LoadState = "idle" | "loading" | "ready" | "error";

const store: {
  state: LoadState;
  mode: ThemeMode;
  loadPromise: Promise<void> | null;
  mediaListenerAttached: boolean;
  listeners: Set<() => void>;
} = {
  state: "idle",
  mode: "auto",
  loadPromise: null,
  mediaListenerAttached: false,
  listeners: new Set(),
};

// Seed the initial mode from localStorage at module load (client bundle only)
// so the FIRST render of any hook consumer already reflects the persisted
// choice — mirrors the pre-hydration script in layout.tsx. Without this,
// AppearanceTab briefly renders with mode="auto" selected before the effect-
// timed reconcile flips the radio, which shows up as a flash of the wrong
// selected pill on cold navigation to /settings.
if (typeof window !== "undefined") {
  try {
    const local = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(local)) store.mode = local;
  } catch {
    /* localStorage unavailable — first render keeps the default "auto" */
  }
}

function emit() {
  for (const listener of store.listeners) listener();
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function resolveEffective(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyToDom(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const effective = resolveEffective(mode);
  document.documentElement.classList.toggle("dark", effective === "dark");
  document.documentElement.dataset.theme = mode;
}

function ensureMediaListener() {
  if (store.mediaListenerAttached) return;
  if (typeof window === "undefined") return;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (store.mode === "auto") applyToDom("auto");
  };
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", handler);
  } else {
    // Safari <14 fallback.
    mql.addListener(handler);
  }
  store.mediaListenerAttached = true;
}

async function ensureLoaded() {
  if (store.state === "ready" || store.state === "loading") {
    return store.loadPromise ?? Promise.resolve();
  }
  // localStorage seed already ran at module load; here we only kick off the
  // server-pref reconcile.
  store.state = "loading";
  emit();
  store.loadPromise = (async () => {
    try {
      const res = await fetch(`/api/ui-prefs/${THEME_PREF_KEY}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const { data } = (await res.json()) as { data: unknown };
        const remote =
          data && typeof data === "object" && "mode" in data
            ? (data as { mode: unknown }).mode
            : null;
        if (isThemeMode(remote) && remote !== store.mode) {
          store.mode = remote;
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(THEME_STORAGE_KEY, remote);
            } catch {
              /* non-blocking */
            }
          }
          applyToDom(remote);
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

async function persist(mode: ThemeMode) {
  try {
    await fetch(`/api/ui-prefs/${THEME_PREF_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ mode }),
    });
  } catch {
    /* non-blocking; next load reconciles */
  }
}

function setMode(next: ThemeMode) {
  store.mode = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* non-blocking */
    }
  }
  applyToDom(next);
  emit();
  void persist(next);
}

export function useThemePreference(): {
  mode: ThemeMode;
  state: LoadState;
  setMode: (mode: ThemeMode) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    ensureMediaListener();
    void ensureLoaded();
    const unsub = subscribe(() => force((n) => n + 1));
    return unsub;
  }, []);

  const setModeCb = useCallback((next: ThemeMode) => {
    if (store.mode === next) return;
    setMode(next);
  }, []);

  return { mode: store.mode, state: store.state, setMode: setModeCb };
}

/** Test-only: reset module-level state between tests. */
export function __resetThemeStoreForTests() {
  store.state = "idle";
  store.mode = "auto";
  store.loadPromise = null;
  store.mediaListenerAttached = false;
  store.listeners.clear();
}

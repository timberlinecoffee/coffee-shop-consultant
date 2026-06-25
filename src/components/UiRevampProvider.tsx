"use client";

// TIM-2589: Feature-flag context for ui_revamp_v2. The app layout resolves
// the flag server-side (DB + cookies + URL override) and passes it here.
// Every Phase 5/6 component calls useUiRevamp() to branch its render.
// TIM-2598 (Phase 5.0 prod merge): default flipped to false.
// TIM-2790: DB column DEFAULT back to true for new signups.
// TIM-2993 (Phase 6 ship, SA-2): default flipped back to TRUE here as well so
// any component rendered outside the provider lands on v2 — matches the
// post-Phase-6 default.

import { createContext, useContext } from "react";

const UiRevampContext = createContext<boolean>(true);

export function UiRevampProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <UiRevampContext.Provider value={value}>{children}</UiRevampContext.Provider>
  );
}

/**
 * Read the effective ui_revamp_v2 flag.
 * true  → render the v2 surface
 * false → render the v1 surface
 *
 * Falls back to true (v2) when used outside the provider so components
 * are never crash-coupled to provider placement and default to the
 * post-Phase-6 chrome (TIM-2993).
 */
export function useUiRevamp(): boolean {
  return useContext(UiRevampContext);
}

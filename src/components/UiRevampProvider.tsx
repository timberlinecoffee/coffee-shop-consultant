"use client";

// TIM-2589: Feature-flag context for ui_revamp_v2. The app layout resolves
// the flag server-side (DB + cookies + URL override) and passes it here.
// Every Phase 5 component calls useUiRevamp() to branch its render.

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
 * Falls back to true (new UI) when used outside the provider so components
 * are never crash-coupled to provider placement.
 */
export function useUiRevamp(): boolean {
  return useContext(UiRevampContext);
}

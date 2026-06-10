"use client";

// TIM-2592: Context for the v2 Scout right rail. WorkspaceProgressProvider
// creates this state and adjusts the content right-padding to match the rail
// width. ScoutRail reads and updates it when the user collapses/expands.

import { createContext, useContext } from "react";

interface ScoutRailContextValue {
  /** true = rail is expanded (300px); false = collapsed (48px icon strip). */
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}

export const ScoutRailContext = createContext<ScoutRailContextValue>({
  expanded: true,
  setExpanded: () => {},
});

export function useScoutRailContext(): ScoutRailContextValue {
  return useContext(ScoutRailContext);
}

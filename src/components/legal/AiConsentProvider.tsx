"use client";

// TIM-1359: Workspace-wide AI consent gate. The CoPilotDrawer has its own gate
// (TIM-1359, approved). This provider covers every OTHER first-AI-output entry
// point (business plan, financials critique, launch readiness, location, menu,
// buildout, hiring, launch timeline, marketing, suppliers, operations) so a user
// cannot receive AI output before affirmative, AI-specific consent. All gates
// share the same localStorage key, so consent given anywhere satisfies all.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AiConsentModal, useAiConsentGiven } from "@/components/legal/AiConsentModal";

type RequireConsent = (run: () => void) => void;

const AiConsentContext = createContext<RequireConsent | null>(null);

export function AiConsentProvider({ children }: { children: React.ReactNode }) {
  const [given, accept] = useAiConsentGiven();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const requireConsent = useCallback<RequireConsent>(
    (run) => {
      if (given) {
        run();
        return;
      }
      pendingRef.current = run;
      setOpen(true);
    },
    [given],
  );

  return (
    <AiConsentContext.Provider value={requireConsent}>
      {children}
      <AiConsentModal
        open={open}
        onAccept={() => {
          accept();
          setOpen(false);
          const run = pendingRef.current;
          pendingRef.current = null;
          if (run) run();
        }}
      />
    </AiConsentContext.Provider>
  );
}

/**
 * Returns a guard that runs `action` immediately if AI consent was already given,
 * otherwise opens the consent modal and defers `action` until the user accepts.
 * Falls back to running `action` directly if used outside the provider.
 */
export function useRequireAiConsent(): RequireConsent {
  const ctx = useContext(AiConsentContext);
  return ctx ?? ((run) => run());
}

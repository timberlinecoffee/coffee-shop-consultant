"use client";

// TIM-643: Hook that wraps write API calls and triggers the paywall modal on 402.
// Usage:
//   const { paywalled, dismissPaywall, guardedFetch } = usePaywallGuard();
//   // render <PaywallModal open={paywalled} onClose={dismissPaywall} />
//   const res = await guardedFetch("/api/workspaces/concept", { method: "POST", body: ... });
//   if (!res) return; // 402 was caught, modal is showing

import { useState, useCallback } from "react";

export function usePaywallGuard() {
  const [paywalled, setPaywalled] = useState(false);

  const dismissPaywall = useCallback(() => setPaywalled(false), []);

  const guardedFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response | null> => {
      const res = await fetch(input, init);
      if (res.status === 402) {
        setPaywalled(true);
        return null;
      }
      return res;
    },
    []
  );

  return { paywalled, dismissPaywall, guardedFetch };
}

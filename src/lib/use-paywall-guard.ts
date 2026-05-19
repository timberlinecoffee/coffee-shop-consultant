"use client";

// TIM-643 / TIM-819: Hook that wraps write API calls and triggers the paywall modal on 402.
// Usage:
//   const { paywalled, paywallReason, dismissPaywall, guardedFetch } = usePaywallGuard();
//   // render <PaywallModal open={paywalled} reason={paywallReason} onClose={dismissPaywall} />
//   const res = await guardedFetch("/api/workspaces/concept", { method: "POST", body: ... });
//   if (!res) return; // 402 was caught, modal is showing

import { useState, useCallback } from "react";
import type { PaywallReason } from "@/components/paywall-modal";

export function usePaywallGuard() {
  const [paywalled, setPaywalled] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>("no_subscription");

  const dismissPaywall = useCallback(() => setPaywalled(false), []);

  const guardedFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response | null> => {
      const res = await fetch(input, init);
      if (res.status === 402) {
        try {
          const cloned = res.clone();
          const payload = (await cloned.json()) as { reason?: string };
          if (payload.reason === "paused") setPaywallReason("paused");
          else if (payload.reason === "expired") setPaywallReason("expired");
          else setPaywallReason("no_subscription");
        } catch {
          setPaywallReason("no_subscription");
        }
        setPaywalled(true);
        return null;
      }
      return res;
    },
    []
  );

  return { paywalled, paywallReason, dismissPaywall, guardedFetch };
}

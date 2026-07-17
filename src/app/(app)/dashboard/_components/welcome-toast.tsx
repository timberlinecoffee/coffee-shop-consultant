"use client";

// TIM-1903: One-time "Welcome to {plan}" toast shown after a trial converts
// to a paid subscription. The Stripe webhook stamps
// `users.trial_just_converted_to` with the plan key on the trialing→active
// transition; this client component renders the toast once, then clears the
// flag via /api/account/dismiss-welcome-toast so the user never sees it twice.

import { useEffect, useState } from "react";
import { Toast } from "@/components/ui/toast";

interface WelcomeToastProps {
  // 'Starter' | 'Pro' — the canonical display name to render in the toast.
  planName: string;
}

const checkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function WelcomeToast({ planName }: WelcomeToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    // Clear the server-side flag so the toast is one-time. Fire-and-forget;
    // if it fails the user simply sees the toast one more time on next load.
    fetch("/api/account/dismiss-welcome-toast", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div data-testid="trial-welcome-toast" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <Toast
        variant="success"
        message={`Welcome to ${planName}. Your subscription is active.`}
        onDismiss={() => setVisible(false)}
        icon={checkIcon}
      />
    </div>
  );
}

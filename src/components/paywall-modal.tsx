"use client";

// TIM-643 / TIM-819: Paywall modal — shown on 402 write blocks or trial exhaustion.
// Copy follows voice mandate (TIM-538): direct, warm, no jargon, no emojis (TIM-196).

import { useEffect, useCallback } from "react";
import Link from "next/link";

export type PaywallVariant = "save" | "copilot_trial";
export type PaywallReason = "no_subscription" | "paused" | "expired" | "past_due";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  variant?: PaywallVariant;
  reason?: PaywallReason;
}

function getContent(
  variant: PaywallVariant,
  reason: PaywallReason,
): { title: string; body: string; cta: string; href: string; dismiss: string } {
  if (variant === "copilot_trial") {
    return {
      title: "You've used your 5 free coaching sessions",
      body: "Your AI coach reads your full plan and gives advice based on your actual numbers — not generic tips. Start a plan to keep that conversation going.",
      cta: "Choose a plan",
      href: "/pricing",
      dismiss: "Not now",
    };
  }

  // variant === "save"
  if (reason === "past_due") {
    return {
      title: "Your payment didn't go through",
      body: "Update your billing info to keep saving your work. Your plan stays paused until the next charge succeeds.",
      cta: "Update billing",
      href: "/account/billing",
      dismiss: "Not now",
    };
  }

  if (reason === "paused" || reason === "expired") {
    return {
      title: "Your plan is paused",
      body: "Reactivate your subscription to pick up where you left off.",
      cta: "Reactivate",
      href: "/account/billing",
      dismiss: "Not now",
    };
  }

  // reason === "no_subscription" (default save variant)
  return {
    title: "Start a plan to save your work",
    body: "You can explore for free. To save your answers and build your full plan, choose a Starter, Growth, or Pro plan.",
    cta: "Choose a plan",
    href: "/pricing",
    dismiss: "Not now",
  };
}

export function PaywallModal({
  open,
  onClose,
  variant = "save",
  reason = "no_subscription",
}: PaywallModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const content = getContent(variant, reason);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#155e63]/10 flex items-center justify-center">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#155e63"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2
          id="paywall-modal-title"
          className="text-lg font-bold text-[#1a1a1a] mb-2"
        >
          {content.title}
        </h2>
        <p className="text-sm text-[#6b6b6b] leading-relaxed mb-6">
          {content.body}
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href={content.href}
            className="block bg-[#155e63] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#0e4448] transition-colors"
          >
            {content.cta}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors py-1"
          >
            {content.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}

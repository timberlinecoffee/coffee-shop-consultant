"use client";

// TIM-643: Paywall modal — shown when any write action returns 402.
// Copy follows voice mandate (TIM-538): direct, warm, no jargon.

import { useEffect, useCallback } from "react";
import Link from "next/link";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

export function PaywallModal({ open, onClose }: PaywallModalProps) {
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
          This is a paid feature
        </h2>
        <p className="text-sm text-[#6b6b6b] leading-relaxed mb-6">
          Saving your work requires an active plan. Free accounts can browse
          but not build. Pick a plan and your progress saves from here on.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            className="block bg-[#155e63] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#0e4448] transition-colors"
          >
            Choose a plan
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors py-1"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

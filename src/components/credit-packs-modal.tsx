"use client";

// TIM-1687: Buy-more-credits modal — one-off credit top-up.
// Shown from the Copilot low/out-of-credit states alongside the Upgrade path.
// Styling mirrors the paywall modal (src/components/paywall-modal.tsx): same
// backdrop, card, and teal token buttons — no new tokens introduced.
// Copy follows the voice mandate (TIM-538): direct, warm, no jargon, no emojis.

import { useEffect, useCallback, useState } from "react";
import { CREDIT_PACK_LIST, formatPackPrice, type CreditPackKey } from "@/lib/credits/packs";

interface CreditPacksModalProps {
  open: boolean;
  onClose: () => void;
  /** Where to send the buyer back to after checkout (defaults to current path). */
  returnPath?: string;
}

export function CreditPacksModal({ open, onClose, returnPath }: CreditPacksModalProps) {
  const [pending, setPending] = useState<CreditPackKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  async function buy(packKey: CreditPackKey) {
    setError(null);
    setPending(packKey);
    try {
      const res = await fetch("/api/stripe/create-credit-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packKey,
          returnPath: returnPath ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout. Try again.");
        setPending(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Could not start checkout. Try again.");
      setPending(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-packs-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--teal)]/10 flex items-center justify-center">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--teal)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2v20M5 5h11a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h12" />
          </svg>
        </div>

        <h2 id="credit-packs-title" className="text-lg font-bold text-[var(--foreground)] mb-2">
          Buy more credits
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-6">
          Top up now to keep planning with Scout this month. Credits are added to your balance right away and never expire while your plan is active.
        </p>

        <div className="flex flex-col gap-3">
          {CREDIT_PACK_LIST.map((pack) => (
            <button
              key={pack.key}
              type="button"
              disabled={pending !== null}
              onClick={() => buy(pack.key)}
              className="flex items-center justify-between gap-4 bg-[var(--surface-warm-50)] hover:bg-[var(--neutral-cool-100)] border border-[var(--border)] rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--foreground)]">
                  {pack.credits} credits
                </span>
                <span className="block text-xs text-[var(--muted-foreground)]">{pack.name}</span>
              </span>
              <span className="text-sm font-semibold text-[var(--teal)] whitespace-nowrap">
                {pending === pack.key ? "Starting…" : formatPackPrice(pack.amountCents)}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors py-1"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

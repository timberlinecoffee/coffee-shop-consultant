"use client";

// TIM-1359: Affirmative AI consent gate — shown once before the first AI output,
// including free-tier trial. Persisted in localStorage so returning users aren't
// re-prompted. Copy from audit doc rev 2 (TIM-1158#document-audit), Surface 1.

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

const CONSENT_KEY = "groundwork_ai_consent_v1";

// Synchronous read for guarding AI work that runs on mount (e.g. auto-fetched
// recommendations), where the React hook's localStorage effect has not run yet.
export function hasAiConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) === "true";
}

export function useAiConsentGiven(): [boolean, () => void] {
  const [given, setGiven] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGiven(localStorage.getItem(CONSENT_KEY) === "true");
    }
  }, []);

  function accept() {
    if (typeof window !== "undefined") {
      localStorage.setItem(CONSENT_KEY, "true");
    }
    setGiven(true);
  }

  return [given, accept];
}

interface Props {
  open: boolean;
  onAccept: () => void;
}

export function AiConsentModal({ open, onAccept }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-[var(--teal)]" aria-hidden="true" />
          <h2 id="ai-consent-title" className="text-base font-semibold text-[var(--foreground)]">
            Before you start planning with AI
          </h2>
        </div>

        <p className="text-sm text-[var(--foreground)] mb-3 leading-relaxed">
          The Groundwork AI co-pilot helps you think through your coffee shop plan. It is not a
          lawyer, accountant, financial advisor, or business consultant.
        </p>
        <p className="text-sm text-[var(--foreground)] mb-5 leading-relaxed">
          AI responses are informational starting points. Always verify important claims and
          consult qualified professionals before making significant decisions.
        </p>

        <div className="bg-[var(--teal-tint-100)] rounded-xl p-3 mb-5 text-xs text-[var(--teal-dark)] leading-relaxed">
          By using Groundwork&apos;s AI features, you acknowledge that AI-generated content is
          informational only and does not constitute legal, financial, accounting, employment, or
          regulatory advice in any jurisdiction.
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="w-full h-11 rounded-xl bg-[var(--teal)] text-white font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors"
        >
          I understand, start planning
        </button>
      </div>
    </div>
  );
}

"use client";

// TIM-3369: HiringRevertToggle — Preferences entry parallel to the chrome-wide
// RevertToggle. Lets a user opt into / out of the Hiring & Onboarding workspace
// IA revamp (left nav of roles + accordion role page) independently of the
// global UI revamp. Persists per-user via PATCH /api/account/hiring-revamp;
// also updates the mirror cookie so the next SSR render is correct.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Visual reference: src/components/account/RevertToggle.tsx (identical
//   pattern, only labels and endpoint differ).

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HiringRevertToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/account/hiring-revamp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(next);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const switchId = "pref-use-new-hiring";

  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label htmlFor={switchId} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-[var(--foreground)]">
          Use new Hiring workspace
        </span>
        <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
          Left nav of roles with accordion sections. Off uses the inline-expand list.
        </span>
      </label>

      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={saving}
        onClick={toggle}
        aria-label={
          enabled ? "Disable new Hiring workspace" : "Enable new Hiring workspace"
        }
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
          enabled ? "bg-[var(--teal)]" : "bg-[var(--border)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>

      {error ? (
        <span className="text-xs text-red-600 self-center">Could not save.</span>
      ) : null}
    </div>
  );
}

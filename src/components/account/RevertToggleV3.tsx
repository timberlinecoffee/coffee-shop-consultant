"use client";

// TIM-3694: RevertToggleV3 — profile popover Preferences entry for v3 UI.
// "Use new UI (v3)" boolean switch. Persists per-user via
// PATCH /api/account/ui-revamp-v3; also updates the mirror cookie so the
// next SSR render is correct.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide section consulted: Buttons → Toggle/Switch, Cards → Settings card
//   Existing component used as visual reference: src/components/account/RevertToggle.tsx
//   All tokens from existing set: --teal, --border, --foreground, --muted-foreground

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevertToggleV3({ initialEnabled }: { initialEnabled: boolean }) {
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
      const res = await fetch("/api/account/ui-revamp-v3", {
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

  const switchId = "pref-use-new-ui-v3";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 py-1">
        <label htmlFor={switchId} className="cursor-pointer select-none">
          <span className="block text-sm font-medium text-[var(--foreground)]">
            Use new UI (v3)
          </span>
          <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
            Toggle the latest Groundwork experience. Off uses the previous UI.
          </span>
        </label>

        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={toggle}
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
      </div>

      {error ? (
        <p className="text-xs text-[var(--destructive)] mt-1">Could not save.</p>
      ) : null}
    </div>
  );
}

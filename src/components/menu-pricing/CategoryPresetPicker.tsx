"use client";

// TIM-3247: Onboarding first-touch picker for user categories with no COGS range set.
// Surfaces inline (no modal) below the category row when target_cogs_low_pct = null.
// Follows design spec from TIM-3244 ui-spec (Surface 3 — Onboarding / First-Touch Range Picker).
//
// Style-guide sections consulted: Disclosure → inline callout (DismissibleCallout teal variant),
// Cards → Table row / inline-edit variant.
// Visual reference: CategoryHeader in menu-workspace.tsx, DismissibleCallout component.

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { CategoryPreset } from "@/lib/menu";

interface Props {
  categoryName: string;
  onApplyPreset: (low: number, high: number) => Promise<void>;
  onSkip: () => void;
}

export function CategoryPresetPicker({ categoryName, onApplyPreset, onSkip }: Props) {
  const [presets, setPresets] = useState<CategoryPreset[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const [customLow, setCustomLow] = useState("");
  const [customHigh, setCustomHigh] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lowRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/workspaces/menu-pricing/category-presets")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPresets(data as CategoryPreset[]);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (mode === "custom") lowRef.current?.focus();
  }, [mode]);

  async function handlePreset(preset: CategoryPreset) {
    setSaving(true);
    try {
      await onApplyPreset(preset.target_cogs_low_pct, preset.target_cogs_high_pct);
    } finally {
      setSaving(false);
    }
  }

  async function handleCustomSave() {
    const low = parseFloat(customLow);
    const high = parseFloat(customHigh);
    if (!Number.isFinite(low) || low < 0 || low > 100) {
      setCustomError("Enter a valid low % between 0 and 100");
      return;
    }
    if (!Number.isFinite(high) || high < 0 || high > 100) {
      setCustomError("Enter a valid high % between 0 and 100");
      return;
    }
    if (low >= high) {
      setCustomError("Low must be less than high");
      return;
    }
    setCustomError(null);
    setSaving(true);
    try {
      await onApplyPreset(low, high);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="animate-in fade-in slide-in-from-top-1 duration-150 rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3 mt-0"
      role="region"
      aria-label={`Set a target COGS range for ${categoryName}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Set a target COGS range for &ldquo;{categoryName}&rdquo;
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Pick a preset that fits your menu, or enter your own.
          </p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          aria-label={`Skip setting a COGS range for now`}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0 mt-0.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Preset buttons or custom range inputs */}
      {mode === "presets" ? (
        <>
          {loadError ? (
            <p className="text-xs text-[var(--muted-foreground)] mt-3">
              Could not load presets. Use a custom range below.
            </p>
          ) : presets.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)] mt-3">Loading presets...</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-3">
              {presets.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  disabled={saving}
                  aria-label={`${p.name} preset: ${p.target_cogs_low_pct}%–${p.target_cogs_high_pct}% COGS target`}
                  onClick={() => handlePreset(p)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--teal-tint)] bg-white text-left text-xs font-medium text-[var(--foreground)] hover:border-[var(--teal)] hover:bg-[var(--teal-tint-50)] transition-colors disabled:opacity-60"
                >
                  <span className="block">{p.name}</span>
                  <span className="block text-[10px] text-[var(--muted-foreground)]">
                    {p.target_cogs_low_pct}%&ndash;{p.target_cogs_high_pct}%
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <button
              type="button"
              onClick={() => setMode("custom")}
              className="text-xs text-[var(--teal)] underline decoration-dotted cursor-pointer"
            >
              Set custom range
            </button>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip setting a COGS range for now"
              className="text-xs text-[var(--muted-foreground)] underline decoration-dotted cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <input
                ref={lowRef}
                type="number"
                min={0}
                max={99}
                step={1}
                value={customLow}
                onChange={(e) => { setCustomLow(e.target.value); setCustomError(null); }}
                aria-label="Low COGS target %"
                placeholder="e.g. 20"
                className="w-16 border border-[var(--border-medium)] rounded-md px-2 py-1 text-xs text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span>%</span>
              <span className="text-[var(--muted-foreground)]">to</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={customHigh}
                onChange={(e) => { setCustomHigh(e.target.value); setCustomError(null); }}
                aria-label="High COGS target %"
                placeholder="e.g. 30"
                className="w-16 border border-[var(--border-medium)] rounded-md px-2 py-1 text-xs text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span>%</span>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleCustomSave}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white font-semibold disabled:opacity-60 hover:bg-[var(--teal-dark)] transition-colors"
            >
              Save
            </button>
          </div>
          {customError && (
            <p role="alert" className="text-xs text-[var(--error)] mt-1">
              {customError}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2">
            <button
              type="button"
              onClick={() => { setMode("presets"); setCustomError(null); }}
              className="text-xs text-[var(--teal)] underline decoration-dotted cursor-pointer"
            >
              Pick a preset instead
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-[var(--muted-foreground)] underline decoration-dotted cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

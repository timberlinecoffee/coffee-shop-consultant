"use client";

// TIM-2472: Adjust-cohort modal — axis override with live sample-size preview.
// Modal (not a drawer) per spec — requires deliberate confirmation before grid updates.

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import type { CohortAxes } from "./types";

const SHOP_MODELS = ["Espresso bar", "Full café", "Drive-through", "Cart / kiosk", "Roaster with café"];
const LOCATION_TYPES = ["Urban", "Suburban", "Rural", "Mall / food court", "Airport / transit"];
const SHOP_SIZES = ["Under 500 sq ft", "500–1,000 sq ft", "1,000–2,000 sq ft", "2,000+ sq ft"];

interface AdjustCohortModalProps {
  current: CohortAxes;
  onApply: (axes: CohortAxes) => void;
  onClose: () => void;
  /** Called to preview sample size for the given axes selection */
  onPreviewSampleSize: (axes: CohortAxes) => Promise<number>;
}

function ToggleChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        selected
          ? "bg-[var(--teal)] text-white border-[var(--teal)]"
          : "bg-white text-[var(--foreground)] border-[var(--border)] hover:border-[var(--teal)]"
      }`}
    >
      {label}
    </button>
  );
}

export function AdjustCohortModal({ current, onApply, onClose, onPreviewSampleSize }: AdjustCohortModalProps) {
  const [shopModel, setShopModel] = useState<string[]>(current.shopModel);
  const [locationType, setLocationType] = useState(current.locationType);
  const [shopSize, setShopSize] = useState<string[]>(current.shopSize);
  const [previewN, setPreviewN] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const draft: CohortAxes = { shopModel, locationType, shopSize };

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    onPreviewSampleSize(draft).then((n) => {
      if (!cancelled) {
        setPreviewN(n);
        setPreviewLoading(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopModel.join(","), locationType, shopSize.join(",")]);

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  const tooThin = previewN != null && previewN < 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Adjust cohort</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ChevronUp size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Shop model */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
              Shop model
            </p>
            <div className="flex flex-wrap gap-2">
              {SHOP_MODELS.map((m) => (
                <ToggleChip
                  key={m}
                  label={m}
                  selected={shopModel.includes(m)}
                  onToggle={() => setShopModel(toggle(shopModel, m))}
                />
              ))}
            </div>
          </div>

          {/* Location type */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
              Location type
            </p>
            <div className="flex flex-wrap gap-2">
              {LOCATION_TYPES.map((l) => (
                <ToggleChip
                  key={l}
                  label={l}
                  selected={locationType === l}
                  onToggle={() => setLocationType(l)}
                />
              ))}
            </div>
          </div>

          {/* Shop size */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
              Shop size
            </p>
            <div className="flex flex-wrap gap-2">
              {SHOP_SIZES.map((s) => (
                <ToggleChip
                  key={s}
                  label={s}
                  selected={shopSize.includes(s)}
                  onToggle={() => setShopSize(toggle(shopSize, s))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sample-size preview */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)]">
          {previewLoading ? (
            <p className="text-xs text-[var(--muted-foreground)]">Calculating sample size…</p>
          ) : previewN != null ? (
            <p className={`text-xs font-medium ${tooThin ? "text-[var(--bench-yellow-text)]" : "text-[var(--foreground)]"}`}>
              {tooThin
                ? `Only ${previewN} shops match — cohort too thin for reliable data.`
                : `${previewN} shops match your criteria.`}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={tooThin || previewLoading}
            onClick={() => { onApply(draft); onClose(); }}
            className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-[var(--teal)] text-white hover:bg-[var(--teal-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

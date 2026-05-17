"use client";

import { useId } from "react";
import type { SensitivityAdjustments } from "@/lib/financials/calc";

interface SensitivitySlidersProps {
  value: SensitivityAdjustments;
  onChange: (next: SensitivityAdjustments) => void;
  onSaveScenario?: () => void;
  saving?: boolean;
  saveStatus?: "idle" | "saved" | "error";
  disabled?: boolean;
}

const RANGE = 50;

export function SensitivitySliders({
  value,
  onChange,
  onSaveScenario,
  saving,
  saveStatus,
  disabled,
}: SensitivitySlidersProps) {
  const revenueId = useId();
  const cogsId = useId();
  const rentId = useId();

  const update = (key: keyof SensitivityAdjustments) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, [key]: Number(event.target.value) });
    };

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg text-[#1a1a1a]">Sensitivity sliders</h2>
          <p className="text-xs text-[#6b6b6b] mt-1">
            Stress-test the charts above. Changes update live and aren’t saved unless you
            click <span className="font-medium text-[#1a1a1a]">Save as scenario</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ revenuePct: 0, cogsPct: 0, rentPct: 0 })}
          className="text-xs text-[#155e63] font-medium hover:underline whitespace-nowrap"
          disabled={disabled}
        >
          Reset
        </button>
      </header>

      <div className="space-y-5">
        <Slider
          id={revenueId}
          label="Revenue"
          value={value.revenuePct}
          onChange={update("revenuePct")}
          disabled={disabled}
        />
        <Slider
          id={cogsId}
          label="COGS"
          value={value.cogsPct}
          onChange={update("cogsPct")}
          disabled={disabled}
        />
        <Slider
          id={rentId}
          label="Rent"
          value={value.rentPct}
          onChange={update("rentPct")}
          disabled={disabled}
        />
      </div>

      {onSaveScenario ? (
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveScenario}
            disabled={saving || disabled}
            className="px-4 py-2 rounded-lg bg-[#155e63] text-white text-sm font-medium hover:bg-[#0f4448] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save as scenario"}
          </button>
          {saveStatus === "saved" ? (
            <span className="text-xs text-[#155e63]">Scenario saved.</span>
          ) : null}
          {saveStatus === "error" ? (
            <span className="text-xs text-[#b45309]">Could not save — try again.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

function Slider({ id, label, value, onChange, disabled }: SliderProps) {
  const sign = value > 0 ? "+" : "";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label htmlFor={id} className="text-sm font-medium text-[#1a1a1a]">
          {label}
        </label>
        <span
          className={`text-xs tabular-nums font-medium ${
            value === 0
              ? "text-[#6b6b6b]"
              : value > 0
                ? "text-[#155e63]"
                : "text-[#b45309]"
          }`}
          data-testid={`slider-value-${label.toLowerCase()}`}
        >
          {sign}
          {value}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={-RANGE}
        max={RANGE}
        step={1}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full accent-[#155e63] disabled:opacity-50"
      />
      <div className="flex justify-between text-[10px] text-[#6b6b6b] mt-1">
        <span>−{RANGE}%</span>
        <span>0</span>
        <span>+{RANGE}%</span>
      </div>
    </div>
  );
}

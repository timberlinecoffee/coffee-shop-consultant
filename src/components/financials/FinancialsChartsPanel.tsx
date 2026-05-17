"use client";

import { useMemo, useState } from "react";
import {
  NO_ADJUSTMENTS,
  applyAdjustments,
  hasAnyInputs,
  normalizeInputs,
  projectWithAdjustments,
  type FinancialInputs,
  type SensitivityAdjustments,
} from "@/lib/financials/calc";
import { BreakEvenChart } from "./BreakEvenChart";
import { MonthlyBurnChart } from "./MonthlyBurnChart";
import { SensitivitySliders } from "./SensitivitySliders";

interface FinancialsChartsPanelProps {
  inputs: Partial<FinancialInputs> | null;
  onSaveScenario?: (
    adjustments: SensitivityAdjustments,
    adjustedInputs: FinancialInputs,
  ) => Promise<void>;
}

export function FinancialsChartsPanel({
  inputs,
  onSaveScenario,
}: FinancialsChartsPanelProps) {
  const baseInputs = useMemo(() => normalizeInputs(inputs), [inputs]);
  const [adjustments, setAdjustments] = useState<SensitivityAdjustments>(NO_ADJUSTMENTS);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saving, setSaving] = useState(false);

  const series = useMemo(
    () => projectWithAdjustments(baseInputs, adjustments),
    [baseInputs, adjustments],
  );

  const inputsAreEmpty = !hasAnyInputs(baseInputs);

  const handleSave = onSaveScenario
    ? async () => {
        setSaving(true);
        setSaveStatus("idle");
        try {
          await onSaveScenario(adjustments, applyAdjustments(baseInputs, adjustments));
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        } finally {
          setSaving(false);
        }
      }
    : undefined;

  return (
    <div className="space-y-6">
      <BreakEvenChart series={series} inputsAreEmpty={inputsAreEmpty} />
      <MonthlyBurnChart series={series} inputsAreEmpty={inputsAreEmpty} />
      <SensitivitySliders
        value={adjustments}
        onChange={(next) => {
          setAdjustments(next);
          setSaveStatus("idle");
        }}
        onSaveScenario={handleSave}
        saving={saving}
        saveStatus={saveStatus}
        disabled={inputsAreEmpty}
      />
    </div>
  );
}

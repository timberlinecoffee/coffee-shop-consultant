"use client";

import { useCallback } from "react";
import type {
  FinancialInputs,
  SensitivityAdjustments,
} from "@/lib/financials/calc";
import { FinancialsChartsPanel } from "./FinancialsChartsPanel";

interface FinancialsClientProps {
  planId: string;
  inputs: Partial<FinancialInputs> | null;
}

export function FinancialsClient({ planId, inputs }: FinancialsClientProps) {
  const saveScenario = useCallback(
    async (adjustments: SensitivityAdjustments, adjustedInputs: FinancialInputs) => {
      const response = await fetch("/api/financials/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          adjustments,
          adjustedInputs,
          savedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
    },
    [planId],
  );

  return <FinancialsChartsPanel inputs={inputs} onSaveScenario={saveScenario} />;
}

// TIM-1438 / TIM-1477: shared wrapper that renders a field label + a "?"
// InfoTip on the same row, replacing the always-visible <p> hint that used to
// sit below the input. Keeps the help reachable but out of the way until the
// user asks for it. Extracted from financials-workspace.tsx so every suite
// (Concept, Financial, Marketing, Operations, SOPs, Dashboard) reuses the
// exact same shared component rather than forking the pattern per suite.

import React from "react";
import { InfoTip } from "@/components/ui/info-tip";

export function LabelWithHint({
  htmlFor,
  className,
  hintLabel,
  hint,
  children,
}: {
  htmlFor?: string;
  className?: string;
  hintLabel?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const labelText =
    typeof children === "string"
      ? children
      : typeof hintLabel === "string"
      ? hintLabel
      : "Field";
  return (
    <span className="flex items-center gap-1.5 mb-1">
      <label htmlFor={htmlFor} className={className}>
        {children}
      </label>
      {hint && <InfoTip label={hintLabel ?? labelText}>{hint}</InfoTip>}
    </span>
  );
}

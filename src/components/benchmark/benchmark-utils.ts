import type { DrilldownData } from "./types";

export function formatRange(d: DrilldownData): string {
  if (d.bpLow == null || d.bpHigh == null) return "—";
  const unit = d.bpUnit ?? "";
  if (unit === "%") return `${d.bpLow}%–${d.bpHigh}%`;
  if (unit.startsWith("$")) return `${unit}${d.bpLow}–${unit}${d.bpHigh}`;
  return `${d.bpLow}–${d.bpHigh}${unit ? ` ${unit}` : ""}`;
}

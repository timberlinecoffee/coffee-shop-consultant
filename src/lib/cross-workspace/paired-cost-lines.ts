// TIM-4117: a revenue stream and the cost of selling it are one decision.
//
// Trent, 2026-08-03: "when they add an additional revenue stream, a line should
// be added as well automatically for the cost of goods too. The cost of goods
// should always be linked to line items elsewhere in the workspace, not just
// having generic cost of goods floating around, because that makes it
// confusing."
//
// Before this, "Add revenue stream" produced revenue with no cost against it.
// The owner had to know to go to a different section, add a cost line, name it
// something they would recognise later, and point it at the right stream. Most
// never did — which quietly overstated profit on every stream they added, in a
// way the screen gave them no reason to suspect.
//
// ── Why this is a module and not four lines inside the component ────────────
//
// The delete half is a correctness fix, not tidiness, and correctness fixes
// need tests. `resolveStreamRevenueCents` in the projection engine FAILS OPEN:
// a cost line whose revenue_stream_id no longer resolves falls back to charging
// against TOTAL revenue. So an orphaned "Cost of goods — Retail Sales" at 45%
// stops costing the retail stream and starts costing the whole business, with
// nothing on screen to say so. Leaving the orphan is the dangerous option.
//
// That behaviour is worth pinning, and a React component is not where you pin
// it. Pure and dependency-free (type-only "@/" imports are erased) so node:test
// can load it directly.

import type { ForecastLine } from "../financial-projection.ts";

/**
 * Add a revenue line together with the cost line that costs it.
 *
 * `genId` is injected rather than imported so the caller keeps its own id
 * scheme, and so tests can assert on stable ids instead of on randomness.
 *
 * The paired line starts at `value: 0`. That is deliberate: a fabricated cost
 * rate would be a number the owner never chose and could not defend to a
 * lender. Zero is visibly unset, which is an honest prompt to fill it in.
 */
export function withPairedCostLine(
  lines: readonly ForecastLine[],
  revenueLine: ForecastLine,
  genId: () => string,
): ForecastLine[] {
  if (revenueLine.category !== "revenue") return [...lines, revenueLine];
  const paired: ForecastLine = {
    id: genId(),
    label: costLineLabel(revenueLine.label),
    category: "cogs",
    mode: "pct",
    value: 0,
    revenue_stream_id: revenueLine.id,
    auto_source: "revenue_stream",
  };
  return [...lines, revenueLine, paired];
}

/** The name the owner reads. One shape, so a list of them scans as a set. */
export function costLineLabel(revenueLabel: string): string {
  return `Cost of goods — ${revenueLabel.trim() || "new revenue stream"}`;
}

/**
 * Remove a line, and any cost line THIS CODE created to go with it.
 *
 * Only `auto_source: "revenue_stream"` lines are swept. A cost line the owner
 * pointed at the stream themselves is their decision: it survives, and merely
 * reverts to the documented total-revenue fallback. Deleting someone's own work
 * because it happened to reference something else is never the safe default.
 */
export function withoutLineAndItsPairs(
  lines: readonly ForecastLine[],
  targetId: string,
): ForecastLine[] {
  const target = lines.find((l) => l.id === targetId);
  if (!target) return [...lines];

  const sweep = new Set<string>([target.id]);
  if (target.category === "revenue") {
    for (const l of lines) {
      if (
        l.category === "cogs" &&
        l.auto_source === "revenue_stream" &&
        l.revenue_stream_id === target.id
      ) {
        sweep.add(l.id);
      }
    }
  }
  return lines.filter((l) => !sweep.has(l.id));
}

/**
 * Cost lines pointing at a revenue stream that no longer exists.
 *
 * Nothing calls this to mutate anything — it exists so a screen can SAY that a
 * cost is being charged against the whole business rather than against the
 * stream its name implies. The engine's fallback is defensible; doing it
 * silently is not.
 */
export function orphanedCostLines(lines: readonly ForecastLine[]): ForecastLine[] {
  const revenueIds = new Set(
    lines.filter((l) => l.category === "revenue").map((l) => l.id),
  );
  return lines.filter(
    (l) =>
      l.category === "cogs" &&
      typeof l.revenue_stream_id === "string" &&
      l.revenue_stream_id !== "all" &&
      l.revenue_stream_id !== "base" &&
      !revenueIds.has(l.revenue_stream_id),
  );
}

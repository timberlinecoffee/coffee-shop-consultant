// TIM-4108 (UX Phase 3): what the Suppliers & Vendors header states.
//
// Per Trent's D-011 ruling, list-shaped workspaces get a factual count rather
// than a progress bar. Suppliers is the debatable case and worth writing down:
// unlike Location & Lease it DOES have a denominator, because the categories
// are seeded, so "3 of 9 categories chosen" is a real fraction and a bar would
// not be a lie.
//
// It still gets a count, for two reasons. The categories are not a checklist
// you are meant to finish — plenty of shops never source a pastry vendor or a
// dairy alternative, and a bar stuck at 60% would nag them about a decision
// they have already correctly made. And a category with a chosen vendor can
// still be worth revisiting, so "done" is softer here than the word implies.
//
// If that reads wrong in use, switching to a bar is a one-line change: return
// { kind: "steps", done: chosen, total: categories } instead.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export interface SupplierCounts {
  /** Categories with a vendor locked in. */
  chosen: number;
  /** Categories on the list, seeded plus any the owner added. */
  categories: number;
}

export function supplierProgress(counts: SupplierCounts): WorkspaceProgress {
  const categories = Math.max(0, Math.floor(counts.categories));
  if (categories === 0) return { kind: "count", text: "No categories yet" };

  const chosen = Math.min(Math.max(0, Math.floor(counts.chosen)), categories);
  const noun = categories === 1 ? "category" : "categories";

  if (chosen === 0) {
    // Say what there is to work through rather than leading with a zero.
    return { kind: "count", text: `${categories} ${noun} to source` };
  }

  return { kind: "count", text: `${chosen} of ${categories} ${noun} chosen` };
}

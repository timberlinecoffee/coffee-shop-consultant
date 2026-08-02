// TIM-4108 (UX Phase 3): what the Equipment & Supplies header says instead of
// a progress bar.
//
// Equipment is the same shape as Location & Lease and Suppliers: a list you
// build, not a path you walk. There is no "6 of 6 done" — a bar cafe and a
// drive-through need different gear and different amounts of it, so any
// denominator we invented would be a number that looks like a measurement and
// is really a guess. Per D-011 it gets a factual count.
//
// Stations are named because they are the thing an owner is actually tracking:
// "have I thought about every part of the bar", not "have I hit a quota".
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export interface EquipmentCounts {
  /** Items still on the list — archived ones are not what the owner is buying. */
  items: number;
  /** Stations / categories those items are spread across. */
  stations: number;
}

export function equipmentProgress(counts: EquipmentCounts): WorkspaceProgress {
  const items = Math.max(0, Math.floor(counts.items));
  if (items === 0) {
    // Not "0 items" — an untouched list should read as not-started, not as a
    // measurement of nothing.
    return { kind: "count", text: "Nothing on the list yet" };
  }

  const itemNoun = items === 1 ? "item" : "items";
  const stations = Math.max(0, Math.floor(counts.stations));
  if (stations === 0) return { kind: "count", text: `${items} ${itemNoun}` };

  const stationNoun = stations === 1 ? "station" : "stations";
  return {
    kind: "count",
    text: `${items} ${itemNoun} · ${stations} ${stationNoun}`,
  };
}

// TIM-4108: the Supplies page, same shape with its own nouns.
//
// Deliberately "categories", not "sections". T1-D settled that "sections" means
// parts of a generated document; borrowing it for a group of cups and lids is
// the ambiguity that change removed.
export function suppliesProgress(counts: {
  items: number;
  categories: number;
}): WorkspaceProgress {
  const items = Math.max(0, Math.floor(counts.items));
  if (items === 0) return { kind: "count", text: "Nothing on the list yet" };

  const itemNoun = items === 1 ? "item" : "items";
  const head = `${items} ${itemNoun}`;
  const categories = Math.max(0, Math.floor(counts.categories));
  if (categories === 0) return { kind: "count", text: head };

  const catNoun = categories === 1 ? "category" : "categories";
  return { kind: "count", text: `${head} · ${categories} ${catNoun}` };
}

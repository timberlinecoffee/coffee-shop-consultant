// TIM-4108 (UX Phase 3): what the Location & Lease header says instead of a
// progress bar.
//
// Trent's ruling 2026-08-02 (D-011): list-shaped workspaces do NOT get progress
// bars. You shortlist candidate sites; there is no "4 of 4 done" to report,
// because there is no denominator. A bar here would be a decoration dressed as
// a measurement.
//
// So this returns a `count` progress — a plain factual line, no bar, no
// percentage. It states what you have, not how close you are to an ending
// nobody defined.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export interface LocationCounts {
  total: number;
  shortlisted: number;
  signed: number;
}

export function locationProgress(counts: LocationCounts): WorkspaceProgress {
  const total = Math.max(0, Math.floor(counts.total));
  if (total === 0) {
    // Not "0 locations" — an empty screen should read as not-started-yet, not
    // as a measurement of nothing.
    return { kind: "count", text: "No locations yet" };
  }

  const noun = total === 1 ? "location" : "locations";
  const head = `${total} ${noun}`;

  // A signed lease is the end of this workspace's story, so it outranks the
  // shortlist count. Once you have signed, how many you were weighing up
  // stopped being the interesting number.
  if (counts.signed > 0) return { kind: "count", text: `${head} · lease signed` };

  const shortlisted = Math.max(0, Math.floor(counts.shortlisted));
  if (shortlisted > 0) {
    return { kind: "count", text: `${head} · ${shortlisted} shortlisted` };
  }

  return { kind: "count", text: head };
}

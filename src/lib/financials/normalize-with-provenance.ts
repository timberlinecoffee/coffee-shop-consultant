// TIM-3448: keep the seed fingerprints alive across a normalize.
//
// `normalizeMonthlyProjections` rebuilds the model from an explicit whitelist
// of fields, which is the right design — it is what stops a malformed stored
// blob from reaching the projection engine. But it means any field the
// whitelist does not name is dropped on every single read, so the fingerprints
// written at creation would survive exactly until the first page load, and
// every seeded step would go straight back to counting as the owner's work.
//
// The obvious fix is to add `seed_fingerprints` to the whitelist. This wrapper
// exists instead, for two reasons:
//
//   1. Provenance is not a financial input. `financial-projection.ts` is the
//      calculation engine — daily flow in, P&L out. Whether the owner has
//      agreed to a number is a product question, not an arithmetic one, and
//      the engine is better off not knowing about it.
//   2. Practical: that file is 137KB, and the only write path available to
//      agents in this environment transports whole files. A one-line change
//      there costs a full re-transcription with a real corruption risk, which
//      is a bad trade for a line that does not belong in it anyway.
//
// The fingerprints ride inside `forecast_inputs` in the database. The PATCH
// route stores that blob verbatim (no server-side normalize), so once attached
// they survive every save. Reads go through here.
//
// No runtime `@/` imports in seed-provenance.ts itself; this file is the seam
// that touches the real model type, and is not loaded by `node --test`.

import {
  normalizeMonthlyProjections,
  type MonthlyProjections,
} from "@/lib/financial-projection";
import { readSeedFingerprints, type SeedFingerprints } from "./seed-provenance";

/**
 * A normalized model that still knows which of its numbers we supplied.
 *
 * Expressed as an intersection rather than by widening `MonthlyProjections`,
 * so the engine's own type stays about finance.
 */
export type MonthlyProjectionsWithProvenance = MonthlyProjections & {
  seed_fingerprints?: SeedFingerprints;
};

/**
 * `normalizeMonthlyProjections`, but the seed fingerprints survive.
 *
 * Use this anywhere the result is shown to the owner or saved back. Plain
 * `normalizeMonthlyProjections` remains correct for pure calculation paths
 * (exports, projections) that never write the model back — but note that a
 * path which normalizes and then SAVES will strip the fingerprints, which is
 * what `normalize-provenance.test.mjs` guards against.
 */
export function normalizeWithProvenance(raw: unknown): MonthlyProjectionsWithProvenance {
  const mp = normalizeMonthlyProjections(raw) as MonthlyProjectionsWithProvenance;
  const fingerprints = readSeedFingerprints(raw);
  if (fingerprints) mp.seed_fingerprints = fingerprints;
  return mp;
}

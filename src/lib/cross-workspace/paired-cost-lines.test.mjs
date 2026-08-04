// TIM-4117: guards for pairing a revenue stream with the cost of selling it.
//
// Run: node --experimental-strip-types --test src/lib/cross-workspace/paired-cost-lines.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  withPairedCostLine,
  withoutLineAndItsPairs,
  orphanedCostLines,
  costLineLabel,
} from "./paired-cost-lines.ts";

let n = 0;
const genId = () => `line:test-${++n}`;
const reset = () => { n = 0; };

const revenue = (id, label) => ({ id, label, category: "revenue", mode: "flat", value: 100000 });

test("adding a revenue stream also creates the cost of selling it", () => {
  reset();
  const out = withPairedCostLine([], revenue("rev-1", "Retail Sales"), genId);
  assert.equal(out.length, 2);

  const [rev, cost] = out;
  assert.equal(rev.id, "rev-1");
  assert.equal(cost.category, "cogs");
  assert.equal(
    cost.revenue_stream_id,
    "rev-1",
    "the cost line does not point at the stream it is supposed to cost"
  );
  assert.equal(cost.auto_source, "revenue_stream");
  assert.equal(cost.mode, "pct", "a stream's cost is a rate, not a fixed monthly sum");
});

test("the cost line is named after the thing it costs", () => {
  // Trent's complaint was that cost of goods showed up as "just a random cost
  // of goods line". A list of lines that all say "COGS" is the bug; a list that
  // says which stream each one belongs to is the fix.
  reset();
  const [, cost] = withPairedCostLine([], revenue("rev-1", "Wholesale"), genId);
  assert.match(cost.label, /Wholesale/, "the cost line does not name its stream");
  assert.equal(costLineLabel("Events"), "Cost of goods — Events");
});

test("the cost rate starts unset rather than invented", () => {
  // A fabricated rate is a number the owner never chose and could not defend to
  // a lender. Zero is visibly unset, which is an honest prompt.
  reset();
  const [, cost] = withPairedCostLine([], revenue("rev-1", "Retail Sales"), genId);
  assert.equal(cost.value, 0);
});

test("adding a non-revenue line pairs nothing", () => {
  reset();
  const overhead = { id: "oh-1", label: "Rent", category: "overhead", mode: "flat", value: 300000 };
  const out = withPairedCostLine([], overhead, genId);
  assert.deepEqual(out, [overhead], "an overhead line was given a cost of goods");
});

test("deleting a revenue stream takes its auto-created cost line with it", () => {
  // The correctness half. The engine FAILS OPEN on an unresolvable
  // revenue_stream_id — it charges the cost against TOTAL revenue instead. So
  // an orphaned "Cost of goods — Retail Sales" at 45% silently starts costing
  // the entire business. Leaving the orphan is the dangerous option.
  reset();
  const lines = withPairedCostLine([], revenue("rev-1", "Retail Sales"), genId);
  const after = withoutLineAndItsPairs(lines, "rev-1");
  assert.deepEqual(after, [], "the orphaned cost line survived its revenue stream");
});

test("a cost line the owner linked themselves is never deleted for them", () => {
  // It has no auto_source, so this code did not create it and has no business
  // removing it. It reverts to the documented total-revenue fallback, which is
  // defensible; deleting someone's own work because it referenced something
  // else is not.
  const mine = {
    id: "cogs-mine",
    label: "Packaging",
    category: "cogs",
    mode: "pct",
    value: 4,
    revenue_stream_id: "rev-1",
  };
  const after = withoutLineAndItsPairs([revenue("rev-1", "Retail Sales"), mine], "rev-1");
  assert.deepEqual(after, [mine], "a hand-made cost line was deleted without being asked");
});

test("deleting one stream leaves every other stream's cost line alone", () => {
  reset();
  let lines = withPairedCostLine([], revenue("rev-1", "Retail Sales"), genId);
  lines = withPairedCostLine(lines, revenue("rev-2", "Events"), genId);
  assert.equal(lines.length, 4);

  const after = withoutLineAndItsPairs(lines, "rev-1");
  assert.equal(after.length, 2);
  assert.equal(after[0].id, "rev-2");
  assert.equal(after[1].revenue_stream_id, "rev-2");
});

test("deleting the cost line alone leaves the revenue stream standing", () => {
  // The owner is allowed to decide a stream costs them nothing to fulfil —
  // consulting, a room hire. Pairing must not become a trap.
  reset();
  const lines = withPairedCostLine([], revenue("rev-1", "Workshops"), genId);
  const after = withoutLineAndItsPairs(lines, lines[1].id);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, "rev-1");
});

test("deleting something that is not there changes nothing", () => {
  reset();
  const lines = withPairedCostLine([], revenue("rev-1", "Retail Sales"), genId);
  assert.deepEqual(withoutLineAndItsPairs(lines, "nope"), lines);
});

test("orphans are findable, because the engine hides them", () => {
  // Not used to mutate anything — it exists so a screen can SAY that a cost is
  // being charged against the whole business rather than the stream its name
  // implies. "all" and "base" are the two legitimate non-stream targets and are
  // not orphans.
  const lines = [
    revenue("rev-1", "Retail Sales"),
    { id: "c1", label: "Cost of goods — Events", category: "cogs", mode: "pct", value: 30, revenue_stream_id: "rev-gone" },
    { id: "c2", label: "Packaging", category: "cogs", mode: "pct", value: 2, revenue_stream_id: "all" },
    { id: "c3", label: "Base cost", category: "cogs", mode: "pct", value: 2, revenue_stream_id: "base" },
    { id: "c4", label: "Cost of goods — Retail Sales", category: "cogs", mode: "pct", value: 40, revenue_stream_id: "rev-1" },
  ];
  assert.deepEqual(orphanedCostLines(lines).map((l) => l.id), ["c1"]);
});

test("auto_source survives a save and reload", () => {
  // THE trap on this codebase. normalizeForecastLine is a silent allowlist: a
  // field it does not explicitly copy is dropped on the next read, and the bug
  // presents as "the auto-link randomly forgets itself" rather than as an
  // error. Three existing fields are already lost this way. If auto_source is
  // dropped, deleting a revenue stream silently stops sweeping its cost line —
  // which is exactly the failure the pairing exists to prevent.
  const src = readFileSync(new URL("../financial-projection.ts", import.meta.url), "utf8");
  const fn = src.match(/function normalizeForecastLine[\s\S]*?\n}/);
  assert.ok(fn, "normalizeForecastLine was renamed or removed");

  assert.match(
    fn[0],
    /auto_source\s*=\s*r\.auto_source/,
    "normalizeForecastLine does not read auto_source off the stored row"
  );
  // Reading it is not enough — it has to be in the returned object too.
  const returned = fn[0].match(/return\s*\{[\s\S]*?\n\s*\};/);
  assert.ok(returned, "could not find the returned line object");
  assert.match(
    returned[0],
    /\bauto_source\b/,
    "auto_source is parsed but not returned — it will vanish on the next read"
  );
});

test("the editor uses the shared rule rather than its own copy", () => {
  // Two implementations of "delete the pair" is how one of them ends up wrong.
  const src = readFileSync(
    new URL("../../app/(app)/workspace/financials/forecast-lines-editor.tsx", import.meta.url),
    "utf8"
  );
  assert.match(src, /withPairedCostLine/, "the editor no longer creates pairs through the shared rule");
  assert.match(src, /withoutLineAndItsPairs/, "the editor no longer deletes pairs through the shared rule");
});

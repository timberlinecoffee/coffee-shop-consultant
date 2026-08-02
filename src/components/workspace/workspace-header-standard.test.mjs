// TIM-4107 (UX Phase 2): the standard covers the whole top of the page,
// and a new workspace cannot quietly opt out of it.
//
// The audit that prompted this: all eleven workspaces already rendered through
// WorkspaceHeader, but it only governed the title row. Everything the owner
// actually noticed — which buttons, in what order, whether progress or a save
// status appeared — was left to each screen. These guards pin the parts that
// are now structural, so the next screen inherits the shape instead of
// inventing one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { progressView } from "./workspace-progress.ts";

const header = readFileSync(new URL("./WorkspaceHeader.tsx", import.meta.url), "utf8");

// ── Action order ─────────────────────────────────────────────────────────────

test("the action cluster order is fixed by the component, not the caller", () => {
  // The whole point of Phase 2. If a caller could choose the order we would be
  // back to eleven screens each picking their own.
  const start = header.indexOf("Order is fixed here");
  assert.ok(start !== -1, "the fixed-order marker must stay in the component");
  // Everything from the marker to the deprecated fallback branch.
  const cluster = header.slice(start, header.indexOf(") : (", start));
  const order = ["scout", "primaryAction", "overflow", "save"]
    .map((slot) => cluster.indexOf(`{${slot}}`));
  assert.ok(order.every((i) => i !== -1), "every slot must be rendered");
  const sorted = [...order].sort((a, b) => a - b);
  assert.deepEqual(order, sorted, "slots must render in the documented order");
});

test("there is exactly one emphasised action slot", () => {
  // Two emphasised buttons is the same as none — nothing stands out.
  const matches = header.match(/primaryAction/g) ?? [];
  assert.ok(matches.length > 0, "the slot must exist");
  assert.doesNotMatch(
    header,
    /primaryActions|secondaryAction\b/,
    "there must be no plural or sibling emphasised slot"
  );
});

test("the emphasised action is documented as the next real step, not the AI action", () => {
  // Trent's ruling 2026-08-02. Recorded in the component so the next person
  // choosing a primary action reads the reasoning rather than guessing.
  assert.match(header, /NEXT REAL THING TO DO/);
  assert.match(header, /not the AI action/);
});

test("the free-form actions escape hatch is marked deprecated", () => {
  assert.match(header, /@deprecated/);
  assert.match(header, /do not add new callers/i);
});

// ── Progress vocabulary ──────────────────────────────────────────────────────

test("a workspace with steps counts them in the T1-D vocabulary", () => {
  const v = progressView({ kind: "steps", done: 4, total: 4 });
  assert.equal(v.label, "4 of 4 steps done");
  assert.equal(v.pct, 100);
  assert.equal(v.showBar, true);
});

test("progress never says sections or workspaces", () => {
  // T1-D settled this: "sections" means parts of a generated document and
  // "workspaces" is Home's unit. Reusing either inside a workspace is the
  // ambiguity that change removed.
  const v = progressView({ kind: "steps", done: 1, total: 5 });
  assert.doesNotMatch(v.label, /section|workspace/i);
  assert.equal(v.pct, 20);
});

test("a list-shaped workspace gets a factual line and NO bar", () => {
  // Trent's ruling 2026-08-02: Location & Lease and Suppliers do not get
  // progress bars. Inventing steps so every screen has a bar would be a
  // decoration dressed as a measurement.
  const v = progressView({ kind: "count", text: "3 locations · 1 signed" });
  assert.equal(v.label, "3 locations · 1 signed");
  assert.equal(v.showBar, false);
  assert.equal(v.pct, null, "no percentage, because there is no denominator");
});

test("a workspace reporting zero steps says so instead of drawing an empty bar", () => {
  const v = progressView({ kind: "steps", done: 0, total: 0 });
  assert.equal(v.showBar, false);
  assert.equal(v.pct, null);
  assert.doesNotMatch(v.label, /0 of 0/);
});

test("counts are clamped so a bad input cannot render past 100%", () => {
  const v = progressView({ kind: "steps", done: 9, total: 4 });
  assert.equal(v.label, "4 of 4 steps done");
  assert.equal(v.pct, 100);
  const n = progressView({ kind: "steps", done: -3, total: 4 });
  assert.equal(n.label, "0 of 4 steps done");
  assert.equal(n.pct, 0);
});

// ── Layout rhythm ────────────────────────────────────────────────────────────

test("progress and the alert band render below the title row, in that order", () => {
  const p = header.indexOf("{progress ?");
  const a = header.indexOf("{alert ?");
  assert.ok(p !== -1 && a !== -1, "both must render");
  assert.ok(p < a, "progress sits above the alert band on every screen");
  assert.ok(
    p > header.indexOf("</header>"),
    "both sit below the title row, not inside it"
  );
});

test("the header still renders through one element with the canonical spacing", () => {
  assert.match(header, /className \?\? "mb-6"/);
});

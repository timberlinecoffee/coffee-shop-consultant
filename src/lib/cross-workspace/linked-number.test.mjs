// TIM-4114 (UX Phase 6): the rules a borrowed number lives by.
//
// The bug this file exists to stop coming back: a plan quietly using a number
// the owner never saw, or accusing the owner of overriding something that was
// never there. Both were live before this phase.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveLinkedNumber,
  freshnessLabel,
  linkedNumberSentence,
} from "./linked-number.ts";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

const pct = (n) => `${n.toFixed(1)}%`;

test("pulling is what happens when nobody has said otherwise", () => {
  // The whole ruling. An unset source is not consent to ignore the menu.
  for (const source of [undefined, null, "linked"]) {
    const v = resolveLinkedNumber({ linkedValue: 31.4, manualValue: 30, source });
    assert.equal(v.using, "linked");
    assert.equal(v.value, 31.4);
  }
});

test("a typed number only wins when the owner said so", () => {
  const v = resolveLinkedNumber({ linkedValue: 31.4, manualValue: 26, source: "manual" });
  assert.equal(v.using, "manual");
  assert.equal(v.value, 26);
  assert.deepEqual(v.drift, { size: 31.4 - 26, direction: "lower" });
});

test("an override with nothing typed keeps the link live", () => {
  // Otherwise clearing the box while overridden zeroes the plan's cost base,
  // and the owner sees a shop with no cost of goods at all.
  const v = resolveLinkedNumber({ linkedValue: 31.4, manualValue: null, source: "manual" });
  assert.equal(v.using, "linked");
  assert.equal(v.value, 31.4);
});

test("nothing to pull is a fallback, never an override", () => {
  // A brand-new plan has no priced menu. Telling that owner they have
  // "overridden the menu" is a lie about a decision they never made.
  const v = resolveLinkedNumber({ linkedValue: null, manualValue: 30, source: "manual" });
  assert.equal(v.using, "fallback");
  assert.equal(v.value, 30);
  assert.equal(v.drift, null);
});

test("an empty plan returns nothing rather than a confident zero", () => {
  const v = resolveLinkedNumber({ linkedValue: null, manualValue: null, source: "linked" });
  assert.equal(v.value, null);
  assert.equal(v.using, "fallback");
});

test("zero and nonsense count as absent on both sides", () => {
  // A zero percentage is not an answer, it is an empty field. Treating it as
  // one would let a half-built menu drive the whole forecast to zero cost.
  for (const bad of [0, -4, NaN, Infinity, undefined, null]) {
    assert.equal(resolveLinkedNumber({ linkedValue: bad, manualValue: 30, source: "linked" }).using, "fallback");
    assert.equal(resolveLinkedNumber({ linkedValue: 31, manualValue: bad, source: "manual" }).using, "linked");
  }
});

test("a rounding-sized gap is not reported as disagreement", () => {
  // Calling 31.40 vs 31.41 a difference trains the owner to ignore the banner
  // that matters.
  const v = resolveLinkedNumber({ linkedValue: 31.41, manualValue: 31.4, source: "manual" });
  assert.equal(v.using, "manual");
  assert.equal(v.drift, null);
});

test("freshness is a real stamp, never a vibe", () => {
  // Trent's words: "it should be clear to know that this has been updated."
  const now = 1_700_000_000_000;
  assert.equal(freshnessLabel(now - 5_000, now), "Checked just now");
  assert.equal(freshnessLabel(now - 12 * 60_000, now), "Checked 12 minutes ago");
  assert.equal(freshnessLabel(now - 3 * 3_600_000, now), "Checked 3 hours ago");
  assert.equal(freshnessLabel(now - 1 * 3_600_000, now), "Checked 1 hour ago");
  assert.equal(freshnessLabel(now - 40 * 3_600_000, now), "Checked more than a day ago");
  assert.equal(freshnessLabel(null, now), null);
});

test("the sentence never explains a control", () => {
  // Same rule the teaching layer lives by (TIM-4112). This text sits inches
  // from a teaching line; if one of them starts saying "click", they both do.
  const UI_WORDS =
    /\b(click|tap|button|field|dropdown|checkbox|toggle|form|screen|page|press|below|above)\b/i;
  const views = [
    resolveLinkedNumber({ linkedValue: 31.4, manualValue: 30, source: "linked" }),
    resolveLinkedNumber({ linkedValue: 31.4, manualValue: 26, source: "manual" }),
    resolveLinkedNumber({ linkedValue: null, manualValue: 30, source: "linked" }),
  ];
  for (const v of views) {
    const s = linkedNumberSentence(v, {
      ownerLabel: "your menu",
      format: pct,
      basis: "priced drinks and food",
    });
    assert.doesNotMatch(s, UI_WORDS, `sentence describes the interface: "${s}"`);
    assert.ok(s.length > 20, "sentence is too thin to say anything");
  }
});

test("the override sentence names both numbers and the gap", () => {
  // "You have overridden this" tells the owner nothing. What they need is what
  // they are disagreeing with and by how much.
  const v = resolveLinkedNumber({ linkedValue: 31.4, manualValue: 26, source: "manual" });
  const s = linkedNumberSentence(v, { ownerLabel: "your menu", format: pct });
  assert.match(s, /31\.4%/);
  assert.match(s, /lower/);
});

test("cost of goods pulls from the menu wherever the plan is computed", () => {
  // The stranded-good-version failure: a sync existed and only one screen used
  // it. This pins the resolution INSIDE the projection engine, so every
  // surface that computes a plan — the screen, the exports, the business plan,
  // the lender metrics — gets the same answer without opting in.
  const src = read("src/lib/financial-projection.ts");
  assert.match(
    src,
    /resolveLinkedNumber\(/,
    "the projection engine no longer resolves cost of goods through the shared rule"
  );
  assert.match(
    src,
    /cogs_source/,
    "the projection engine has no record of whether the owner overrode the menu"
  );
});

test("a brand-new plan starts linked, not overridden", () => {
  const src = read("src/lib/financial-projection.ts");
  const defaults = src.slice(src.indexOf("export function defaultMonthlyProjections"));
  assert.match(
    defaults.slice(0, 1500),
    /cogs_source:\s*"linked"/,
    "new plans must default to pulling from the menu"
  );
});

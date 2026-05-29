// TIM-1322: pin the menu-engineering matrix math. Popularity is the owner's
// estimate (low/med/high); each axis splits at the menu's own average.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  popularityScore,
  grossMarginPct,
  effectiveCogsCents,
  marginRanking,
  classifyMenu,
  QUADRANT_META,
} from "./menu-engineering.ts";

function item(overrides) {
  return {
    id: "i",
    name: "Item",
    price_cents: 500,
    cogs_cents: 100,
    computed_cogs_cents: 0,
    expected_popularity: "medium",
    archived: false,
    ...overrides,
  };
}

test("popularityScore maps low/medium/high to 1/2/3, null otherwise", () => {
  assert.equal(popularityScore("low"), 1);
  assert.equal(popularityScore("medium"), 2);
  assert.equal(popularityScore("high"), 3);
  assert.equal(popularityScore(null), null);
  assert.equal(popularityScore(undefined), null);
});

test("effectiveCogsCents prefers computed COGS, falls back to manual, then 0", () => {
  assert.equal(effectiveCogsCents(item({ computed_cogs_cents: 250, cogs_cents: 100 })), 250);
  assert.equal(effectiveCogsCents(item({ computed_cogs_cents: 0, cogs_cents: 100 })), 100);
  assert.equal(effectiveCogsCents(item({ computed_cogs_cents: null, cogs_cents: null })), 0);
});

test("grossMarginPct = (price - cogs) / price; null without price+cost", () => {
  assert.equal(grossMarginPct(item({ price_cents: 500, cogs_cents: 100 })), 80);
  assert.equal(grossMarginPct(item({ price_cents: 400, cogs_cents: 100 })), 75);
  assert.equal(grossMarginPct(item({ price_cents: 0, cogs_cents: 100 })), null);
  assert.equal(grossMarginPct(item({ price_cents: 500, cogs_cents: null, computed_cogs_cents: 0 })), null);
});

test("marginRanking sorts most -> least profitable and excludes unpriced/costless", () => {
  const ranked = marginRanking([
    item({ id: "a", price_cents: 500, cogs_cents: 400 }), // 20%
    item({ id: "b", price_cents: 500, cogs_cents: 100 }), // 80%
    item({ id: "c", price_cents: 600, cogs_cents: 300 }), // 50%
    item({ id: "d", price_cents: 0, cogs_cents: 100 }), // excluded (no price)
    item({ id: "e", price_cents: 500, cogs_cents: null, computed_cogs_cents: 0 }), // excluded (no cost)
    item({ id: "f", price_cents: 500, cogs_cents: 100, archived: true }), // excluded (archived)
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ["b", "c", "a"]);
  assert.equal(ranked[0].marginPct, 80);
  assert.equal(ranked[0].gpCents, 400);
});

test("classifyMenu assigns Star/Plowhorse/Puzzle/Dog by average split", () => {
  const { classified, counts, thresholds } = classifyMenu([
    item({ id: "star", price_cents: 500, cogs_cents: 100, expected_popularity: "high" }), // 80%, pop 3
    item({ id: "plow", price_cents: 500, cogs_cents: 400, expected_popularity: "high" }), // 20%, pop 3
    item({ id: "puzz", price_cents: 500, cogs_cents: 100, expected_popularity: "low" }), // 80%, pop 1
    item({ id: "dog", price_cents: 500, cogs_cents: 400, expected_popularity: "low" }), // 20%, pop 1
  ]);
  const byId = Object.fromEntries(classified.map((c) => [c.id, c.quadrant]));
  assert.equal(byId.star, "star");
  assert.equal(byId.plow, "plowhorse");
  assert.equal(byId.puzz, "puzzle");
  assert.equal(byId.dog, "dog");
  assert.deepEqual(counts, { star: 1, plowhorse: 1, puzzle: 1, dog: 1 });
  assert.equal(thresholds.avgMarginPct, 50);
  assert.equal(thresholds.avgPopScore, 2);
});

test("classifyMenu carries the plain-English recommendation per quadrant", () => {
  const { classified } = classifyMenu([
    item({ id: "s", price_cents: 500, cogs_cents: 100, expected_popularity: "high" }),
    item({ id: "d", price_cents: 500, cogs_cents: 450, expected_popularity: "low" }),
  ]);
  const star = classified.find((c) => c.quadrant === "star");
  assert.equal(star.recommendation, QUADRANT_META.star.recommendation);
});

test("classifyMenu reports exactly what each unclassifiable item is missing", () => {
  const { needsInfo, classified } = classifyMenu([
    item({ id: "noprice", price_cents: 0, cogs_cents: 100, expected_popularity: "high" }),
    item({ id: "nocost", price_cents: 500, cogs_cents: null, computed_cogs_cents: 0, expected_popularity: "high" }),
    item({ id: "nopop", price_cents: 500, cogs_cents: 100, expected_popularity: null }),
    item({ id: "none", price_cents: 0, cogs_cents: null, computed_cogs_cents: 0, expected_popularity: null }),
  ]);
  assert.equal(classified.length, 0);
  const byId = Object.fromEntries(needsInfo.map((n) => [n.id, n.missing]));
  assert.deepEqual(byId.noprice, ["price"]);
  assert.deepEqual(byId.nocost, ["cost"]);
  assert.deepEqual(byId.nopop, ["popularity"]);
  assert.deepEqual(byId.none, ["price", "cost", "popularity"]);
});

test("a single classifiable item splits against itself and lands as a Star", () => {
  const { classified, thresholds } = classifyMenu([
    item({ id: "solo", price_cents: 500, cogs_cents: 150, expected_popularity: "medium" }),
  ]);
  assert.equal(classified.length, 1);
  assert.equal(classified[0].quadrant, "star");
  assert.equal(thresholds.avgPopScore, 2);
});

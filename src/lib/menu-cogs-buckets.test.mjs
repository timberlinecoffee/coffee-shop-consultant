// TIM-4115 (UX Phase 5): guards for the Drink / Food / Retail split.
//
// The thing being replaced is six hardcoded literals that pretended to be the
// owner's numbers. The risk in replacing them is doing it again more subtly —
// a classifier that quietly sends half the menu to the wrong bucket, or a blend
// that stops agreeing with the plan-wide COGS percentage sitting next to it on
// the same screen. These tests exist for that, not for coverage.
//
// Run: node --experimental-strip-types --test src/lib/menu-cogs-buckets.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyMenuCategory,
  blendMenuByBucket,
  bucketMixWeight,
  COGS_BUCKETS,
} from "./menu-cogs-buckets.ts";

const item = (category_name, price_cents, cogs_cents, expected_popularity = null) => ({
  category_name,
  price_cents,
  computed_cogs_cents: cogs_cents,
  expected_popularity,
});

test("the seeded category names land where a shop owner would expect", () => {
  // These five are what every new plan starts with (TIM-1140 defaults). If the
  // classifier gets THESE wrong, it is wrong for almost every plan in the
  // product, so they are pinned by name.
  assert.equal(classifyMenuCategory("Espresso"), "beverage");
  assert.equal(classifyMenuCategory("Brewed Coffee"), "beverage");
  assert.equal(classifyMenuCategory("Food"), "food");
  assert.equal(classifyMenuCategory("Retail"), "retail");
  assert.equal(classifyMenuCategory("Seasonal"), "beverage");
});

test("coffee the drink and coffee the bag go to different buckets", () => {
  // The single most likely misclassification, and the most expensive: retail
  // beans run 30–40% cost against espresso's 15–20%. Getting these confused
  // moves real money between rows.
  assert.equal(classifyMenuCategory("Coffee"), "beverage");
  assert.equal(classifyMenuCategory("Iced Coffee"), "beverage");
  assert.equal(classifyMenuCategory("Coffee Beans"), "retail");
  assert.equal(classifyMenuCategory("Whole Bean Retail"), "retail");
  assert.equal(classifyMenuCategory("Retail Bags"), "retail");
});

test("the preset names from the seeded reference table classify correctly", () => {
  // menu_category_presets ships five slugs with target COGS bands. An owner who
  // picks a preset gets its name copied onto their category, so these strings
  // reach the classifier verbatim.
  assert.equal(classifyMenuCategory("Beverages (Espresso/Tea)"), "beverage");
  assert.equal(classifyMenuCategory("Food (Pastries/Baked Goods)"), "food");
  assert.equal(classifyMenuCategory("Coffee Beans (Retail Bags)"), "retail");
  assert.equal(classifyMenuCategory("Large Food (Sandwiches/Salads)"), "food");
  assert.equal(classifyMenuCategory("Retail Items (Merch/Mugs)"), "retail");
});

test("an unrecognised category is counted, not dropped", () => {
  // Rule 2 of the module: default to beverage rather than to an "unknown"
  // bucket. A shop that renames Espresso to something with personality must
  // still see its costs. A silent fourth bucket would put money in a row the
  // P&L has no line for.
  assert.equal(classifyMenuCategory("The Good Stuff"), "beverage");
  assert.equal(classifyMenuCategory(""), "beverage");
  assert.equal(classifyMenuCategory(null), "beverage");
  assert.equal(classifyMenuCategory(undefined), "beverage");
  for (const name of ["The Good Stuff", "", null, undefined]) {
    assert.ok(
      COGS_BUCKETS.includes(classifyMenuCategory(name)),
      `${name} escaped the three buckets`
    );
  }
});

test("classification ignores case and surrounding words", () => {
  assert.equal(classifyMenuCategory("PASTRIES"), "food");
  assert.equal(classifyMenuCategory("  Fresh Pastries & Bakes  "), "food");
  assert.equal(classifyMenuCategory("Merchandise"), "retail");
});

test("revenue shares add up to the whole menu", () => {
  // The old literals were 70/20/10. This asserts the new numbers are a real
  // partition rather than three independent guesses that happen to look like one.
  const blends = blendMenuByBucket([
    item("Espresso", 500, 100),
    item("Food", 400, 160),
    item("Retail", 1800, 720),
  ]);
  const total = COGS_BUCKETS.reduce((s, b) => s + blends[b].revenue_pct, 0);
  assert.ok(Math.abs(total - 100) < 0.0001, `shares sum to ${total}, not 100`);
});

test("each bucket's cost rate is its own, not the menu average", () => {
  // The whole point. Espresso at 20% and retail at 40% must not both come back
  // as the blended 30-ish percent the plan-wide number would give.
  const blends = blendMenuByBucket([
    item("Espresso", 500, 100), // 20%
    item("Retail Bags", 2000, 800), // 40%
  ]);
  assert.ok(Math.abs(blends.beverage.cogs_pct - 20) < 0.0001);
  assert.ok(Math.abs(blends.retail.cogs_pct - 40) < 0.0001);
  assert.equal(blends.food.item_count, 0);
});

test("popularity moves the split, and does so the same way as the plan-wide blend", () => {
  // A high-popularity item counts 3×. If this drifts from menuItemMixWeight,
  // the split and the single COGS % on the same screen disagree, and the owner
  // has no way to tell which one lied.
  const evenly = blendMenuByBucket([
    item("Espresso", 500, 100),
    item("Food", 500, 250),
  ]);
  assert.ok(Math.abs(evenly.beverage.revenue_pct - 50) < 0.0001);

  const drinksPopular = blendMenuByBucket([
    item("Espresso", 500, 100, "high"),
    item("Food", 500, 250, "low"),
  ]);
  assert.ok(
    drinksPopular.beverage.revenue_pct > evenly.beverage.revenue_pct,
    "making drinks popular did not increase their share"
  );
  assert.ok(Math.abs(drinksPopular.beverage.revenue_pct - 75) < 0.0001);
});

test("the mix weights match the plan-wide blend exactly", () => {
  // bucketMixWeight is a deliberate local copy so this module stays free of the
  // 129KB projection file. This is the price of that copy: the two must agree.
  const src = readFileSync(new URL("./financial-projection.ts", import.meta.url), "utf8");
  const fn = src.match(/export function menuItemMixWeight[\s\S]*?\n}/);
  assert.ok(fn, "menuItemMixWeight is gone or was renamed");
  for (const [popularity, expected] of [
    ["high", 3],
    ["medium", 2],
    ["low", 1],
  ]) {
    assert.match(
      fn[0],
      new RegExp(`"${popularity}"\\)\\s*return\\s*${expected}`),
      `menuItemMixWeight no longer maps ${popularity} to ${expected}`
    );
    assert.equal(bucketMixWeight(popularity), expected);
  }
  assert.equal(bucketMixWeight(null), 1, "an unrated item must not be dropped");
  assert.equal(bucketMixWeight(undefined), 1);
});

test("an empty or unpriced menu returns nothing rather than zeroes", () => {
  // The caller keeps the documented industry defaults in this case. Returning
  // a 0% drink cost for a plan with no menu yet would be a confident lie, which
  // is the exact failure this whole change exists to remove.
  assert.equal(blendMenuByBucket([]), null);
  assert.equal(blendMenuByBucket(null), null);
  assert.equal(blendMenuByBucket(undefined), null);
  assert.equal(blendMenuByBucket([item("Espresso", 0, 0)]), null);
});

test("archived and unpriced items are excluded, matching the plan-wide blend", () => {
  const blends = blendMenuByBucket([
    item("Espresso", 500, 100),
    { ...item("Food", 400, 400), archived: true },
    item("Retail", 0, 0),
  ]);
  assert.ok(Math.abs(blends.beverage.revenue_pct - 100) < 0.0001);
  assert.equal(blends.food.item_count, 0, "an archived item was counted");
  assert.equal(blends.retail.item_count, 0, "an unpriced item was counted");
});

test("a bucket the shop does not sell costs nothing", () => {
  // Zero rate × zero share. The alternative — inventing a plausible rate for an
  // empty bucket — is how the hardcoded literals got there in the first place.
  const blends = blendMenuByBucket([item("Espresso", 500, 100)]);
  assert.equal(blends.food.revenue_pct, 0);
  assert.equal(blends.food.cogs_pct, 0);
  assert.equal(blends.retail.revenue_pct, 0);
  assert.equal(blends.retail.cogs_pct, 0);
});

test("the hardcoded split cannot come back as the primary answer", () => {
  // The literals still exist as the no-menu fallback, which is correct. What
  // must never happen again is them being returned unconditionally. This pins
  // the shape: every one of the six fields reads from the menu first.
  const src = readFileSync(new URL("./financial-projection.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  for (const field of [
    "beverage_revenue_pct",
    "food_revenue_pct",
    "retail_revenue_pct",
    "beverage_cogs_pct",
    "food_cogs_pct",
    "retail_cogs_pct",
  ]) {
    const assignment = src.match(new RegExp(`\\n\\s*${field}:\\s*([^,\\n]+),`));
    assert.ok(assignment, `${field} is no longer returned by deriveFinancialInputs`);
    assert.match(
      assignment[1],
      /bucketBlends\?\./,
      `${field} went back to a bare literal: ${assignment[1].trim()}`
    );
    assert.match(
      assignment[1],
      /\?\?\s*\d+/,
      `${field} lost its no-menu fallback — an empty menu would report 0%`
    );
  }
});

test("the P&L is actually handed the split it computes", () => {
  // The subtle version of the same bug, and the one that nearly shipped:
  // deriveFinancialInputs can return perfect numbers while computeMonthlySlices
  // quietly falls back to its own 70/20/10 defaults, because the caller builds
  // a narrowed inputs object and simply did not include these six fields. It
  // did not, for months. The rows looked plausible the whole time.
  const src = readFileSync(
    new URL("../app/(app)/workspace/financials/financials-workspace.tsx", import.meta.url),
    "utf8"
  );
  const block = src.match(/const balanceSheetInputs = \{[\s\S]*?\n\s*\};/);
  assert.ok(block, "the slices input object was renamed or restructured");
  for (const field of [
    "beverage_revenue_pct",
    "food_revenue_pct",
    "retail_revenue_pct",
    "beverage_cogs_pct",
    "food_cogs_pct",
    "retail_cogs_pct",
  ]) {
    assert.match(
      block[0],
      new RegExp(`${field}:`),
      `${field} is not passed to computeMonthlySlices — the P&L will use its own default`
    );
  }
});

test("the split reconciles with the plan-wide blended percentage", () => {
  // The number that matters. Σ(share × rate) across buckets must equal the
  // single blended COGS % the rest of the product already shows, or the P&L
  // rows will not add up to the total printed directly beneath them — which is
  // precisely the bug being fixed.
  const items = [
    item("Espresso", 500, 100, "high"),
    item("Brewed Coffee", 300, 45, "medium"),
    item("Pastries", 400, 160, "medium"),
    item("Coffee Beans", 1800, 720, "low"),
  ];
  const blends = blendMenuByBucket(items);
  const recombined = COGS_BUCKETS.reduce(
    (s, b) => s + (blends[b].revenue_pct / 100) * blends[b].cogs_pct,
    0
  );

  // The plan-wide blend, computed the way financial-projection does it.
  let cost = 0;
  let revenue = 0;
  for (const it of items) {
    const w = bucketMixWeight(it.expected_popularity);
    cost += it.computed_cogs_cents * w;
    revenue += it.price_cents * w;
  }
  const planWide = (cost / revenue) * 100;

  assert.ok(
    Math.abs(recombined - planWide) < 0.0001,
    `split recombines to ${recombined.toFixed(4)}% but the plan-wide blend is ${planWide.toFixed(4)}%`
  );
});

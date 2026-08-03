// TIM-4115 (UX Phase 5): make the Drink / Food / Retail cost rows real.
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// Trent, 2026-08-03: "There should be, I think, food cost of goods and beverage
// cost of goods, because in the financial plan we have food and beverage cost
// of goods... The cost of goods should always be linked to line items elsewhere
// in the workspace, not just having generic cost of goods floating around,
// because that makes it confusing."
//
// The P&L already HAS those rows. They are fiction. `deriveFinancialInputs`
// returns six hardcoded literals — beverage/food/retail revenue at 70/20/10 and
// their cost rates at 30/35/45 — and the P&L multiplies total revenue by them.
// So "Drink Costs" is `revenue × 0.70 × 0.30` on every plan ever created,
// identical for a drive-thru espresso bar and a bakery-cafe, unmoved by a
// single thing the owner typed. The three rows also do not sum to the total
// COGS line printed directly beneath them.
//
// This module replaces those literals with the owner's actual menu.
//
// ── The one judgement call: which bucket is a category in? ───────────────────
//
// There is no machine-readable signal in the schema. `menu_categories` carries
// `financial_role`, but the seeded values are PROSE ("Core revenue driver;
// offsets high labor & machinery overhead.") and the column is never backfilled
// on existing plans, so it is null in practice. Category rows are per-plan free
// text — seeded as Espresso / Brewed Coffee / Food / Retail / Seasonal, and
// renamable.
//
// So the bucket is inferred from the category NAME. That is a heuristic, and
// heuristics rot silently, so three rules apply:
//
//   1. It only ever has to be roughly right. It splits an aggregate the owner
//      currently cannot see at all; being 90% right is infinitely better than
//      the hardcoded literals it replaces.
//   2. It defaults to BEVERAGE, not to "unknown". This is a coffee shop. An
//      unrecognised category is far more likely to be a drink than anything
//      else, and a silent "uncategorised" bucket would put money in a row the
//      P&L has no line for.
//   3. It is pure and word-listed, never a model call. The owner must be able
//      to predict where "Seasonal Specials" lands, and the same plan must
//      classify identically on the server and in the browser.
//
// Deliberately dependency-free (no runtime "@/" imports) so node:test can load
// it directly — the same constraint the rest of the pure-logic modules follow.

/**
 * The three cost buckets the P&L already prints rows for.
 * Not an open set: adding a fourth means adding a P&L row to match.
 */
export type CogsBucket = "beverage" | "food" | "retail";

export const COGS_BUCKETS: readonly CogsBucket[] = ["beverage", "food", "retail"];

/** The label the owner sees. Kept here so the P&L and the cost lines agree. */
export const COGS_BUCKET_LABEL: Record<CogsBucket, string> = {
  beverage: "Drinks",
  food: "Food",
  retail: "Retail",
};

// Matched against a lowercased category name, most specific first. Order
// matters: "coffee beans" is retail, but "coffee" alone is a drink, so the
// retail list is tested before the beverage list.
const RETAIL_WORDS = [
  "retail",
  "merch",
  "bean",
  "whole bean",
  "bag",
  "mug",
  "gift",
  "equipment",
  "brewing gear",
  "apparel",
];

const FOOD_WORDS = [
  "food",
  "pastr",
  "bake",
  "sandwich",
  "salad",
  "snack",
  "cake",
  "cookie",
  "muffin",
  "croissant",
  "bagel",
  "toast",
  "breakfast",
  "lunch",
  "kitchen",
  "deli",
  "soup",
  "bowl",
];

/**
 * Which bucket a menu category belongs to.
 *
 * Unrecognised names fall to "beverage" on purpose — see rule 2 above. A shop
 * that renames "Espresso" to "The Good Stuff" still gets its costs counted.
 */
export function classifyMenuCategory(
  categoryName: string | null | undefined,
): CogsBucket {
  const name = (categoryName ?? "").toLowerCase();
  if (RETAIL_WORDS.some((w) => name.includes(w))) return "retail";
  if (FOOD_WORDS.some((w) => name.includes(w))) return "food";
  return "beverage";
}

/**
 * Relative sales-mix weight for one item.
 *
 * Intentionally a local copy of `menuItemMixWeight` from financial-projection,
 * so this module stays importable by anything without dragging a 129KB file
 * along. `menu-cogs-buckets.test.mjs` pins the two to the same 3/2/1 mapping,
 * so a change to one that is not made to the other fails the build.
 *
 * On why this is popularity and not a typed percentage: TIM-2491 removed the
 * `expected_mix_pct > 0` path deliberately — old rows carried a real percent
 * and new rows only ever carry popularity, so a mixed menu weighted legacy
 * items 10–70× as heavily as recent ones. That decision stands here.
 */
export function bucketMixWeight(popularity: string | null | undefined): number {
  if (popularity === "high") return 3;
  if (popularity === "medium") return 2;
  if (popularity === "low") return 1;
  return 1;
}

/** The shape this module needs. A structural subset of MenuItemForCogs. */
export interface BucketableMenuItem {
  category_name?: string | null;
  price_cents: number;
  computed_cogs_cents?: number | null;
  cogs_cents?: number | null;
  expected_popularity?: string | null;
  archived?: boolean | null;
}

/** What one bucket contributes, in the two shapes the P&L needs. */
export interface BucketBlend {
  /** Share of menu revenue this bucket represents, 0–100. */
  revenue_pct: number;
  /** Blended cost rate WITHIN this bucket, 0–100. */
  cogs_pct: number;
  /** How many priced, unarchived items produced these numbers. */
  item_count: number;
}

export type BucketBlends = Record<CogsBucket, BucketBlend>;

/**
 * Flatten the category groups the Financials workspace already holds into the
 * shape this module blends.
 *
 * Worth stating why this exists rather than a new query: `groupMenuItemsByCategory`
 * output is already loaded server-side, already passed down as a prop, and
 * already kept fresh by the "Refresh from Menu" control. It carries
 * `category_name` — which the flat `menuCogsItems` breakdown shape does not —
 * so it is the only menu data in scope that can be bucketed at all.
 *
 * Structurally typed on purpose: importing `MenuCogsCategoryGroup` would pull
 * this dependency-free module into the 129KB projection file's import graph and
 * break `node --experimental-strip-types` loading it directly.
 */
export function bucketablesFromCategoryGroups(
  groups:
    | ReadonlyArray<{
        category_name: string;
        items: ReadonlyArray<{
          price_cents: number;
          computed_cogs_cents: number;
          expected_popularity?: string | null;
        }>;
      }>
    | null
    | undefined,
): BucketableMenuItem[] {
  if (!groups) return [];
  const out: BucketableMenuItem[] = [];
  for (const group of groups) {
    for (const it of group.items) {
      out.push({
        category_name: group.category_name,
        price_cents: it.price_cents,
        computed_cogs_cents: it.computed_cogs_cents,
        expected_popularity: it.expected_popularity ?? null,
      });
    }
  }
  return out;
}

function effectiveCogsCents(item: BucketableMenuItem): number {
  if (typeof item.computed_cogs_cents === "number") return item.computed_cogs_cents;
  if (typeof item.cogs_cents === "number") return item.cogs_cents;
  return 0;
}

/**
 * Split the menu into the three buckets and blend each one.
 *
 * Returns null when the menu cannot answer — no items, or none priced. The
 * caller then keeps the old hardcoded literals, which is honest: a plan with an
 * empty menu genuinely has no basis for a split, and inventing 0% drink costs
 * would be worse than a documented industry default.
 *
 * `revenue_pct` across the three buckets sums to 100 (modulo rounding at the
 * display layer). `cogs_pct` is WITHIN a bucket, so the buckets' rates do not
 * sum to anything — which is the correct shape for the P&L, where each row is
 * `revenue × bucket revenue share × bucket cost rate`.
 */
export function blendMenuByBucket(
  items: ReadonlyArray<BucketableMenuItem> | null | undefined,
): BucketBlends | null {
  if (!items || items.length === 0) return null;

  const cost: Record<CogsBucket, number> = { beverage: 0, food: 0, retail: 0 };
  const revenue: Record<CogsBucket, number> = { beverage: 0, food: 0, retail: 0 };
  const count: Record<CogsBucket, number> = { beverage: 0, food: 0, retail: 0 };
  let totalRevenue = 0;

  for (const item of items) {
    if (item.archived) continue;
    const price =
      typeof item.price_cents === "number" && item.price_cents > 0
        ? item.price_cents
        : 0;
    // An unpriced item cannot contribute a rate. Skipping matches
    // computeMenuBlendedCogsPct so the plan-wide number and the split agree.
    if (price === 0) continue;

    const bucket = classifyMenuCategory(item.category_name);
    const weight = bucketMixWeight(item.expected_popularity);
    cost[bucket] += effectiveCogsCents(item) * weight;
    revenue[bucket] += price * weight;
    count[bucket] += 1;
    totalRevenue += price * weight;
  }

  if (totalRevenue <= 0) return null;

  const out = {} as BucketBlends;
  for (const bucket of COGS_BUCKETS) {
    out[bucket] = {
      revenue_pct: (revenue[bucket] / totalRevenue) * 100,
      // A bucket with no items has no rate. Zero is the truthful answer here —
      // it is multiplied by a zero revenue share, so it contributes nothing
      // either way, and a fabricated rate would show up in the P&L as a cost
      // for a bucket the shop does not sell.
      cogs_pct: revenue[bucket] > 0 ? (cost[bucket] / revenue[bucket]) * 100 : 0,
      item_count: count[bucket],
    };
  }
  return out;
}

// TIM-2519: Pin shop-type × city-tier startup-cost calibration.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calibrateStartupCosts,
  pickShopTypeKey,
  pickCityTier,
  startupCostsTotalCents,
  SHOP_TYPE_BASES_CENTS,
  CITY_TIER_MULTIPLIERS,
} from "./startup-cost-calibration.ts";

const CENT = 1;
const DOLLAR = 100 * CENT;
const K = 1000 * DOLLAR;

// ── AC#1: mobile_cart + Austin ≈ $50k ────────────────────────────────────────
test("TIM-2519 AC#1: mobile_cart + Austin onboarding seeds ≈ $50k startup costs", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Mobile cart or pop-up"],
    city: "Austin",
    countryCode: "US",
  });
  const total = startupCostsTotalCents(sc);
  assert.equal(total, 50 * K, "mobile_cart + Austin total");
  // Bucket spot-checks: mobile carts skew to equipment + WC, not buildout.
  assert.ok(sc.equipment_cents > sc.buildout_cents, "equipment > buildout for cart");
  assert.equal(sc.equipment_cents, 20 * K);
  assert.equal(sc.buildout_cents, 5 * K);
  assert.equal(sc.working_capital_reserve_cents, 12 * K);
  assert.equal(sc.opening_cash_buffer_cents, 5 * K);
});

// ── AC#2: full_cafe + Seattle ≈ $490k ───────────────────────────────────────
test("TIM-2519 AC#2: full_cafe + Seattle onboarding seeds ≈ $490k startup costs", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Full cafe with food"],
    city: "Seattle",
    countryCode: "US",
  });
  const total = startupCostsTotalCents(sc);
  assert.equal(total, 490 * K, "full_cafe + Seattle total");
  // Tier-1 buildout dominates and is way above the legacy $150k seed.
  assert.ok(sc.buildout_cents > 200 * K, "Tier 1 buildout should exceed $200k");
  assert.equal(sc.buildout_cents, 259 * K);
});

// ── Tier × shop-type matrix sanity ───────────────────────────────────────────
test("TIM-2519: drive_thru + Denver (Tier 2) baseline totals ≈ $250k", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Drive-through"],
    city: "Denver",
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 250 * K);
});

test("TIM-2519: roastery+retail + Toronto (Tier 1) ≈ $400k × 1.4 = $560k", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Roastery cafe"],
    city: "Toronto",
    countryCode: "CA",
  });
  assert.equal(startupCostsTotalCents(sc), 560 * K);
});

test("TIM-2519: espresso_bar with no city falls back to Tier 2 baseline ($120k)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Espresso bar (drinks only)"],
    city: null,
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 120 * K);
});

test("TIM-2519: unknown city in known country uses Tier 2 baseline (safe default)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Full cafe with food"],
    city: "Random Town",
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 350 * K);
});

test("TIM-2519: NYC + drive_thru applies Tier 1 multiplier even on a non-cafe type", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Drive-through"],
    city: "New York",
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 350 * K); // 250k × 1.4 = 350k
});

// ── Shop-type resolution ─────────────────────────────────────────────────────
test("TIM-2519: pickShopTypeKey maps onboarding display strings", () => {
  assert.equal(pickShopTypeKey(["Full cafe with food"]), "full_cafe");
  assert.equal(pickShopTypeKey(["Mobile cart or pop-up"]), "mobile_cart");
  assert.equal(pickShopTypeKey(["Mobile cart or kiosk"]), "mobile_cart");
  assert.equal(pickShopTypeKey(["Espresso bar (drinks only)"]), "espresso_bar");
  assert.equal(pickShopTypeKey(["Drive-through"]), "drive_thru");
  assert.equal(pickShopTypeKey(["Roastery cafe"]), "roastery_retail");
});

test("TIM-2519: multi-select picks the largest-capex model", () => {
  // Roastery + mobile cart → roastery (don't under-seed a $400k operation).
  assert.equal(
    pickShopTypeKey(["Mobile cart or pop-up", "Roastery cafe"]),
    "roastery_retail",
  );
  // Full cafe + drive-through → full_cafe (priority order).
  assert.equal(
    pickShopTypeKey(["Drive-through", "Full cafe with food"]),
    "full_cafe",
  );
  // Espresso bar + mobile cart → espresso_bar.
  assert.equal(
    pickShopTypeKey(["Mobile cart or pop-up", "Espresso bar (drinks only)"]),
    "espresso_bar",
  );
});

test("TIM-2519: empty/unknown shop_type defaults to full_cafe (legacy assumption)", () => {
  assert.equal(pickShopTypeKey([]), "full_cafe");
  assert.equal(pickShopTypeKey(null), "full_cafe");
  assert.equal(pickShopTypeKey(undefined), "full_cafe");
  assert.equal(pickShopTypeKey(["Something we don't recognise"]), "full_cafe");
});

// ── City-tier resolution ─────────────────────────────────────────────────────
test("TIM-2519: pickCityTier matches Data Analyst tier list", () => {
  // Tier 1
  for (const c of ["Seattle", "san francisco", "New York", "Los Angeles", "Toronto", "Melbourne", "Sydney"]) {
    assert.equal(pickCityTier(c, null), "tier1", `${c} should be Tier 1`);
  }
  // Tier 2 (explicit + fallback)
  for (const c of ["Austin", "Calgary", "Denver", "Mexico City", "CDMX"]) {
    assert.equal(pickCityTier(c, null), "tier2", `${c} should be Tier 2`);
  }
  // Unknown city falls back to Tier 2 baseline (safer than under-seeding).
  assert.equal(pickCityTier("Nowheresville", "US"), "tier2");
  assert.equal(pickCityTier(null, "US"), "tier2");
  assert.equal(pickCityTier(null, null), "tier2");
});

test("TIM-2519: city matching is case- and whitespace-insensitive", () => {
  assert.equal(pickCityTier("  SEATTLE  ", "US"), "tier1");
  assert.equal(pickCityTier("new york city", "US"), "tier1");
  assert.equal(pickCityTier("NYC", "US"), "tier1");
});

// ── Backward-compat: no calibration signal mirrors Tier 2 full_cafe ──────────
test("TIM-2519: null/undefined signal returns Tier 2 full_cafe baseline ($350k)", () => {
  assert.equal(startupCostsTotalCents(calibrateStartupCosts(null)), 350 * K);
  assert.equal(startupCostsTotalCents(calibrateStartupCosts(undefined)), 350 * K);
  assert.equal(startupCostsTotalCents(calibrateStartupCosts({})), 350 * K);
});

test("TIM-2519: depreciation useful-lives unchanged from legacy defaults", () => {
  const sc = calibrateStartupCosts({ shopTypes: ["Full cafe with food"] });
  assert.equal(sc.buildout_useful_life_years, 15);
  assert.equal(sc.equipment_useful_life_years, 7);
});

// ── Calibration table sanity ─────────────────────────────────────────────────
test("TIM-2519: SHOP_TYPE_BASES_CENTS matches the TIM-2519 spec table", () => {
  assert.equal(SHOP_TYPE_BASES_CENTS.mobile_cart, 50 * K);
  assert.equal(SHOP_TYPE_BASES_CENTS.espresso_bar, 120 * K);
  assert.equal(SHOP_TYPE_BASES_CENTS.drive_thru, 250 * K);
  assert.equal(SHOP_TYPE_BASES_CENTS.full_cafe, 350 * K);
  assert.equal(SHOP_TYPE_BASES_CENTS.roastery_retail, 400 * K);
});

test("TIM-2519: CITY_TIER_MULTIPLIERS matches the TIM-2519 spec", () => {
  assert.equal(CITY_TIER_MULTIPLIERS.tier1, 1.4);
  assert.equal(CITY_TIER_MULTIPLIERS.tier2, 1.0);
  assert.equal(CITY_TIER_MULTIPLIERS.tier3, 0.8);
});

// ── Regression: pre-TIM-2519 system default was 2-4× too low for full_cafe ──
test("TIM-2519 (regression CQ-03): full_cafe + Seattle ≥ $400k (was $244k)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Full cafe with food"],
    city: "Seattle",
    countryCode: "US",
  });
  assert.ok(startupCostsTotalCents(sc) >= 400 * K, "Seattle full cafe should land in the $400-700k real range");
});

test("TIM-2519 (regression CQ-03): mobile_cart Austin ≤ $80k (was $244k)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Mobile cart or pop-up"],
    city: "Austin",
    countryCode: "US",
  });
  assert.ok(startupCostsTotalCents(sc) <= 80 * K, "Austin mobile cart should land in the $40-80k real range");
});

// ── TIM-2534: Tier 3 city pin tests ─────────────────────────────────────────
test("TIM-2534 AC#1: mobile_cart + Boise (Tier 3) ≈ $40k (50k × 0.8)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Mobile cart or pop-up"],
    city: "Boise",
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 40 * K, "mobile_cart + Boise (Tier 3) total");
});

test("TIM-2534 AC#2: full_cafe + Spokane (Tier 3) ≈ $280k (350k × 0.8)", () => {
  const sc = calibrateStartupCosts({
    shopTypes: ["Full cafe with food"],
    city: "Spokane",
    countryCode: "US",
  });
  assert.equal(startupCostsTotalCents(sc), 280 * K, "full_cafe + Spokane (Tier 3) total");
});

test("TIM-2534: pickCityTier classifies all 16 Tier 3 cities correctly", () => {
  const tier3Cities = [
    "Boise", "Spokane", "Eugene", "Missoula", "Fargo",
    "Sioux Falls", "Tucson", "El Paso", "Grand Rapids", "Fort Collins",
    "Flagstaff", "Provo", "Ogden", "Billings", "Saskatoon", "Kelowna",
  ];
  for (const city of tier3Cities) {
    assert.equal(pickCityTier(city, null), "tier3", `${city} should be Tier 3`);
  }
});

test("TIM-2534: Tier 3 multiplier (0.8) produces costs below Tier 2 baseline", () => {
  const tier2 = startupCostsTotalCents(calibrateStartupCosts({ shopTypes: ["Full cafe with food"], city: "Austin" }));
  const tier3 = startupCostsTotalCents(calibrateStartupCosts({ shopTypes: ["Full cafe with food"], city: "Fargo" }));
  assert.ok(tier3 < tier2, "Tier 3 city startup costs should be below Tier 2");
  assert.equal(tier3, 280 * K); // 350k × 0.8
  assert.equal(tier2, 350 * K);
});

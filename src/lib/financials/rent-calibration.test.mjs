// TIM-2522 (CQ-08): Pin shop-type × city-tier × currency rent calibration.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calibrateRent,
  pickRentTier,
  RENT_USD_CENTS,
  applyCalibratedRentToForecastLines,
} from "./rent-calibration.ts";

// ── AC#1: full_cafe + Seattle ≈ $9,000/mo (USD) ───────────────────────────
test("TIM-2522 AC#1: full_cafe + Seattle seeds ≈ $9,000/mo (USD)", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Full cafe with food"],
    city: "Seattle",
    countryCode: "US",
    currencyCode: "USD",
  });
  assert.equal(rentCents, 900_000, "full_cafe + Seattle USD = $9,000/mo");
});

// ── AC#2: mobile_cart + Mexico City ≈ $400/mo USD-equivalent (in MXN) ─────
test("TIM-2522 AC#2: mobile_cart + Mexico City seeds $400-equivalent (in MXN)", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Mobile cart or pop-up"],
    city: "Mexico City",
    countryCode: "MX",
    currencyCode: "MXN",
  });
  // $400 USD × 18 MXN/USD = MXN 7,200 = 720,000 MXN cents.
  assert.equal(rentCents, 720_000, "mobile_cart Mexico City MXN = MXN 7,200/mo");
});

// ── Other rows from CQ-08 spec table ─────────────────────────────────────
test("TIM-2522: espresso_bar Tier 1 USD = $5,500/mo", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Espresso bar (drinks only)"],
    city: "Toronto",
    currencyCode: "USD",
  });
  // Toronto is Tier 1 per startup-cost-calibration CITY_TIERS.
  assert.equal(rentCents, 550_000);
});

test("TIM-2522: drive_thru Tier 2 USD = $3,800/mo", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Drive-through"],
    city: "Denver",
    currencyCode: "USD",
  });
  // Denver is Tier 2.
  assert.equal(rentCents, 380_000);
});

test("TIM-2522: roastery_retail Tier 1 USD = $7,500/mo", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Roastery cafe"],
    city: "San Francisco",
    currencyCode: "USD",
  });
  assert.equal(rentCents, 750_000);
});

test("TIM-2522: full_cafe Tier 2 USD = $6,500/mo (Austin)", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Full cafe with food"],
    city: "Austin",
    currencyCode: "USD",
  });
  assert.equal(rentCents, 650_000);
});

// ── Currency conversion: Toronto plan with CAD currency ───────────────────
test("TIM-2522: full_cafe + Toronto + CAD applies USD→CAD FX", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Full cafe with food"],
    city: "Toronto",
    countryCode: "CA",
    currencyCode: "CAD",
  });
  // Toronto = Tier 1; full_cafe = $9,000 USD; × 1.37 CAD/USD = CAD 12,330.
  // Rounded to nearest $100: CAD 12,300 = 1,230,000 CAD cents.
  assert.equal(rentCents, 1_230_000);
});

test("TIM-2522: espresso_bar + Melbourne + AUD applies USD→AUD FX", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Espresso bar (drinks only)"],
    city: "Melbourne",
    countryCode: "AU",
    currencyCode: "AUD",
  });
  // Melbourne = Tier 1; espresso_bar = $5,500 USD; × 1.50 AUD = AUD 8,250.
  // Rounded to nearest $100 → AUD 8,300 (banker's-round of 8,250).
  assert.equal(rentCents, 830_000);
});

// ── pickRentTier classification ────────────────────────────────────────────
test("TIM-2522 pickRentTier: Seattle → tier1", () => {
  assert.equal(pickRentTier("Seattle", "US"), "tier1");
});

test("TIM-2522 pickRentTier: Austin → tier2", () => {
  assert.equal(pickRentTier("Austin", "US"), "tier2");
});

test("TIM-2522 pickRentTier: Mexico City → mexico (city literal)", () => {
  assert.equal(pickRentTier("Mexico City", null), "mexico");
});

test("TIM-2522 pickRentTier: CDMX alias → mexico", () => {
  assert.equal(pickRentTier("CDMX", null), "mexico");
});

test("TIM-2522 pickRentTier: MX country code → mexico (fallback)", () => {
  assert.equal(pickRentTier("Guadalajara", "MX"), "mexico");
});

test("TIM-2522 pickRentTier: unknown city → tier2 (safe default)", () => {
  assert.equal(pickRentTier(null, null), "tier2");
});

// ── Drive-thru × Mexico fallback ──────────────────────────────────────────
test("TIM-2522: drive_thru × Mexico falls back to Tier 2 USD baseline", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Drive-through"],
    city: "Mexico City",
    currencyCode: "MXN",
  });
  // Drive-thru × Mexico is null in the table; fall back to Tier 2 = $3,800.
  // $3,800 × 18 MXN = MXN 68,400. Rounded to nearest $100 stays at 6,840,000.
  assert.equal(rentCents, 6_840_000);
});

// ── No signal: safe default ───────────────────────────────────────────────
test("TIM-2522: no shop types or city → full_cafe + tier2 USD = $6,500", () => {
  assert.equal(calibrateRent(null), 650_000);
  assert.equal(calibrateRent(undefined), 650_000);
  assert.equal(calibrateRent({}), 650_000);
});

// ── Multi-shop prioritization (most capital-intensive wins) ────────────────
test("TIM-2522: roastery wins over mobile_cart in multi-shop signal", () => {
  const rentCents = calibrateRent({
    shopTypes: ["Mobile cart or pop-up", "Roastery cafe"],
    city: "Seattle",
    currencyCode: "USD",
  });
  // pickShopTypeKey prioritizes roastery_retail → Tier 1 row = $7,500.
  assert.equal(rentCents, 750_000);
});

// ── RENT_USD_CENTS table completeness ─────────────────────────────────────
test("TIM-2522: RENT_USD_CENTS table covers all 5 shop types × 4 tiers", () => {
  const shopTypes = Object.keys(RENT_USD_CENTS);
  assert.equal(shopTypes.length, 5, "5 shop-type rows");
  for (const shop of shopTypes) {
    const row = RENT_USD_CENTS[shop];
    assert.ok("tier1" in row, `${shop} has tier1`);
    assert.ok("tier2" in row, `${shop} has tier2`);
    assert.ok("tier3" in row, `${shop} has tier3`);
    assert.ok("mexico" in row, `${shop} has mexico`);
  }
});

// ── applyCalibratedRentToForecastLines mutates the rent line in place ─────
test("TIM-2522: applyCalibratedRentToForecastLines updates rent line value", () => {
  const lines = [
    { id: "x", label: "Rent", category: "overhead", mode: "flat", value: 450_000, legacy_key: "rent" },
    { id: "y", label: "Marketing", category: "overhead", mode: "pct", value: 2, legacy_key: "marketing" },
  ];
  applyCalibratedRentToForecastLines(lines, 900_000);
  assert.equal(lines[0].value, 900_000, "rent line value updated");
  assert.equal(lines[0].mode, "flat", "rent line mode forced to flat");
  assert.equal(lines[1].value, 2, "non-rent line untouched");
});

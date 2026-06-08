// TIM-2340: Pin local-claims behavior — prompt directive, sentinel phrases,
// competitor block rendering, geography validator, foot-traffic fabrication
// detector, and the city resolver. Mirrors the node:test pattern used by
// plan-state.test.mjs (no @/ imports, no Next.js path-alias resolver).

import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_CLAIMS_DIRECTIVE,
  SENTINEL_PHRASES,
  GEOGRAPHY_DATASET,
  buildLocalClaims,
  formatLocalClaimsForPrompt,
  resolveCityFromAddress,
  validateGeography,
  detectFabricatedLocalClaims,
} from "./local-claims.ts";

// ── Directive + sentinel-phrase content ──────────────────────────────────────

test("LOCAL_CLAIMS_DIRECTIVE forbids the investor-flagged fabrications", () => {
  const d = LOCAL_CLAIMS_DIRECTIVE;
  // Each of the four investor-flagged hallucination classes must be named
  // explicitly in the directive so the LLM can't claim it wasn't told.
  assert.match(d, /pedestrian counts?/i, "must forbid pedestrian counts");
  assert.match(d, /visitor counts?|visitor numbers?/i, "must forbid visitor counts");
  assert.match(d, /competitor (names|addresses|hours)/i, "must forbid competitor specifics");
  assert.match(d, /neighborhood/i, "must address neighborhood adjacency");
  // The investor's framing: "Inventing a specific number is worse than omitting one."
  assert.match(d, /inventing a specific number is worse than omitting one/i);
});

test("LOCAL_CLAIMS_DIRECTIVE surfaces every sentinel phrase verbatim", () => {
  for (const p of SENTINEL_PHRASES) {
    assert.ok(
      LOCAL_CLAIMS_DIRECTIVE.includes(p),
      `directive must surface sentinel phrase "${p}" verbatim (LLM needs the exact voice-matched fallback language)`,
    );
  }
});

test("SENTINEL_PHRASES voice — short, qualitative, no fabricated numbers", () => {
  // Each sentinel should be a usable hedge — short enough to drop into prose,
  // and free of specific numbers (the whole point is that they DO NOT carry
  // figures the LLM could mistake for permission to invent more).
  for (const p of SENTINEL_PHRASES) {
    assert.ok(p.length >= 20 && p.length <= 90, `"${p}" length out of range`);
    assert.ok(!/\d/.test(p), `sentinel "${p}" must not contain digits`);
  }
});

// ── buildLocalClaims + prompt block ──────────────────────────────────────────

test("buildLocalClaims preserves user-entered competitors, trims, drops blanks", () => {
  const out = buildLocalClaims({
    competitors: [
      { id: "c1", name: "  Kawa Espresso Bar  ", address: " 1009 4 St NW ", what_they_do_well: " Quick drip. ", gaps: " No third-wave focus. " },
      { id: "c2", name: "", address: null, what_they_do_well: null, gaps: null },
      { id: "c3", name: "Phil & Sebastian", address: null, what_they_do_well: null, gaps: null },
    ],
    noDirectCompetitorsIdentified: false,
    cityLabel: "Calgary",
  });
  assert.equal(out.competitors.length, 2, "blank-name row must be dropped");
  assert.equal(out.competitors[0].name, "Kawa Espresso Bar");
  assert.equal(out.competitors[0].address, "1009 4 St NW");
  assert.equal(out.competitors[0].what_they_do_well, "Quick drip.");
  assert.equal(out.competitors[1].name, "Phil & Sebastian");
  assert.equal(out.competitors[1].address, null);
  assert.equal(out.no_direct_competitors_identified, false);
  assert.equal(out.city_label, "Calgary");
});

test("formatLocalClaimsForPrompt — no competitors entered → strict forbid block", () => {
  const block = formatLocalClaimsForPrompt(buildLocalClaims({
    competitors: [],
    noDirectCompetitorsIdentified: false,
    cityLabel: "Calgary",
  }));
  // The LLM must see "discuss qualitatively without naming specific shops"
  // as the explicit instruction when the user hasn't filled out the list.
  assert.match(block, /not entered a competitor list/i);
  assert.match(block, /qualitatively/i);
  assert.match(block, /do not invent competitor businesses/i);
  assert.match(block, /Calgary/);
});

test("formatLocalClaimsForPrompt — explicit 'no direct competitors' toggle", () => {
  const block = formatLocalClaimsForPrompt(buildLocalClaims({
    competitors: [],
    noDirectCompetitorsIdentified: true,
    cityLabel: "Calgary",
  }));
  // When the toggle is on, the LLM is allowed to state plainly that there
  // are no direct competitors instead of falling back to qualitative hedge.
  assert.match(block, /no direct competitors/i);
  assert.match(block, /state that plainly/i);
});

test("formatLocalClaimsForPrompt — competitor list renders name + address + strength + gap", () => {
  const block = formatLocalClaimsForPrompt(buildLocalClaims({
    competitors: [
      { id: "c1", name: "Phil & Sebastian", address: "618 Confederation Dr NW", what_they_do_well: "Roastery cred.", gaps: "Short hours." },
    ],
    noDirectCompetitorsIdentified: false,
    cityLabel: "Calgary",
  }));
  assert.match(block, /Phil & Sebastian/);
  assert.match(block, /618 Confederation Dr NW/);
  assert.match(block, /Roastery cred/);
  assert.match(block, /Short hours/);
  // The "user-entered" framing must be in the block so the LLM knows it's the
  // exhaustive list, not a starting point.
  assert.match(block, /these are the only competitors you may name/i);
});

test("formatLocalClaimsForPrompt — no city label → location not set", () => {
  const block = formatLocalClaimsForPrompt(buildLocalClaims({
    competitors: [],
    noDirectCompetitorsIdentified: false,
    cityLabel: null,
  }));
  assert.match(block, /Resolved location: not set/i);
});

// ── Geography dataset & city resolver ────────────────────────────────────────

test("GEOGRAPHY_DATASET — every notAdjacent neighborhood is in the city list", () => {
  // Cross-check internal consistency: pairs in notAdjacent must reference
  // neighborhoods we actually claim to recognize for that city.
  for (const g of GEOGRAPHY_DATASET) {
    const set = new Set(g.neighborhoods.map((n) => n.toLowerCase()));
    for (const [a, b] of g.notAdjacent) {
      assert.ok(set.has(a.toLowerCase()), `${g.city}: notAdjacent uses unknown neighborhood "${a}"`);
      assert.ok(set.has(b.toLowerCase()), `${g.city}: notAdjacent uses unknown neighborhood "${b}"`);
    }
  }
});

test("GEOGRAPHY_DATASET — Calgary carries the investor-flagged Bridgeland/Aspen Landing pair", () => {
  const calgary = GEOGRAPHY_DATASET.find((g) => g.city === "calgary");
  assert.ok(calgary, "Calgary must be in the dataset (Beaver & Beef fixture)");
  const pairs = calgary.notAdjacent.map(([a, b]) => `${a}|${b}`);
  assert.ok(
    pairs.includes("bridgeland|aspen landing"),
    "Bridgeland/Aspen Landing must be flagged (the investor's specific call-out)",
  );
});

test("resolveCityFromAddress — picks Calgary on '1009 4 St NW, Calgary, AB' (CA)", () => {
  const c = resolveCityFromAddress("1009 4 St NW, Calgary, AB", "CA");
  assert.equal(c?.city, "calgary");
});

test("resolveCityFromAddress — country filter blocks wrong-region match", () => {
  // No US city named Calgary, but a fake address that contains the word.
  // The country filter must constrain matches so we don't pick the wrong city.
  const c = resolveCityFromAddress("Calgary Road, Phoenix, AZ", "US");
  assert.equal(c, null, "Calgary is CA-only — must not match in a US filter");
});

test("resolveCityFromAddress — word-boundary protects 'York' inside 'Yorkville'", () => {
  // The word-boundary check stops 'new york' from matching when the address
  // contains 'Yorkville Avenue, Toronto'.
  const c = resolveCityFromAddress("123 Yorkville Avenue, Toronto, ON", "CA");
  assert.equal(c?.city, "toronto", "must resolve Toronto, not pick up 'York' substring");
});

// ── validateGeography — the central acceptance criterion (#3) ─────────────────

test("validateGeography catches 'Bridgeland/Aspen Landing corridor' (investor fixture)", () => {
  const city = GEOGRAPHY_DATASET.find((g) => g.city === "calgary");
  const findings = validateGeography({
    sectionKey: "opportunity-target-market",
    text: "The Bridgeland/Aspen Landing corridor sees strong daytime foot traffic from professional commuters.",
    city,
  });
  assert.equal(findings.length, 1, "exactly one finding for the slash framing");
  assert.equal(findings[0].category, "geographic_fabrication");
  assert.match(findings[0].message, /Bridgeland and Aspen Landing are not adjacent/i);
  assert.deepEqual(findings[0].pair.sort(), ["aspen landing", "bridgeland"].sort());
});

test("validateGeography catches 'between Inglewood and Aspen Landing' framing", () => {
  const city = GEOGRAPHY_DATASET.find((g) => g.city === "calgary");
  const findings = validateGeography({
    sectionKey: "opportunity-competition",
    text: "The shop sits between Inglewood and Aspen Landing, drawing both sets of customers.",
    city,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "geographic_fabrication");
});

test("validateGeography catches the dash-corridor framing", () => {
  const city = GEOGRAPHY_DATASET.find((g) => g.city === "calgary");
  const findings = validateGeography({
    sectionKey: "company-overview",
    text: "The Bridgeland-Aspen Landing corridor anchors our concept.",
    city,
  });
  assert.equal(findings.length, 1);
});

test("validateGeography does NOT flag legitimately adjacent neighborhoods", () => {
  // Bridgeland is genuinely adjacent to Kensington and Beltline (both inner
  // city). Pair them and we should see ZERO findings.
  const city = GEOGRAPHY_DATASET.find((g) => g.city === "calgary");
  const findings = validateGeography({
    sectionKey: "company-overview",
    text: "Foot traffic flows between Bridgeland and Kensington across the bridge daily.",
    city,
  });
  assert.equal(findings.length, 0, "Bridgeland↔Kensington isn't flagged — they ARE adjacent");
});

test("validateGeography is a no-op when the city is null", () => {
  // No resolved city = no claims to check. Validator must not throw.
  const findings = validateGeography({
    sectionKey: "executive-summary",
    text: "We are between Bridgeland and Aspen Landing.",
    city: null,
  });
  assert.equal(findings.length, 0);
});

// ── detectFabricatedLocalClaims — the foot-traffic safety net ────────────────

test("detectFabricatedLocalClaims catches '800 to 1,200 pedestrians per day'", () => {
  // Verbatim from the TIM-2315 investor critique on Beaver & Beef.
  const f = detectFabricatedLocalClaims({
    sectionKey: "opportunity-target-market",
    text: "Saturday daytime foot traffic on the Inglewood main strip runs 800 to 1,200 pedestrians per day.",
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].category, "fabricated_local_claim");
  assert.match(f[0].quoted_text, /800 to 1,200 pedestrians per day/);
});

test("detectFabricatedLocalClaims catches '12,000 to 15,000 weekly visitors'", () => {
  const f = detectFabricatedLocalClaims({
    sectionKey: "opportunity-target-market",
    text: "The strip pulls in 12,000 to 15,000 weekly visitors during peak season.",
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].category, "fabricated_local_claim");
});

test("detectFabricatedLocalClaims is silent on qualitative phrasing", () => {
  // The "write around it" voice must NOT trip the detector.
  for (const p of SENTINEL_PHRASES) {
    const f = detectFabricatedLocalClaims({ sectionKey: "x", text: `The corridor shows ${p}.` });
    assert.equal(f.length, 0, `sentinel phrase "${p}" must not be flagged`);
  }
});

test("detectFabricatedLocalClaims is silent on legitimate dollar/headcount figures", () => {
  // Sanity check: monetary and headcount figures in business prose are
  // NEVER what this detector targets. It only catches pedestrian/visitor
  // figures.
  const f = detectFabricatedLocalClaims({
    sectionKey: "financial-plan-statements",
    text: "Revenue reaches $450,000 in Year 1 with 3 staff on the floor.",
  });
  assert.equal(f.length, 0);
});

// ── Edge case: prompt block stays empty/safe with all-empty inputs ───────────

test("formatLocalClaimsForPrompt — works with fully-empty PlanStateLocalClaims", () => {
  const block = formatLocalClaimsForPrompt({
    competitors: [],
    no_direct_competitors_identified: false,
    city_label: null,
  });
  // Must produce content (the "discuss qualitatively" forbid block) AND must
  // never produce an empty string — an empty prompt block would be a silent
  // regression of the guardrail.
  assert.ok(block.length > 100, "block must always carry the directive context");
  assert.match(block, /Local Claims & Competitors/);
});

// TIM-3854: pinning tests for the workspace-first Business Plan seed context.
// Every failure here corresponds to a specific bullet in the board directive
// on TIM-3854, so a regression in the mapping / summarizer shape / empty
// handling surfaces here before it reaches the founder.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSectionSourceWorkspaces,
  summarizeConcept,
  summarizeMenu,
  summarizeFinancial,
  summarizeLocation,
  summarizeEquipment,
  summarizeHiring,
  summarizeMarketing,
  buildSeedBlocksForSection,
  formatSeedBlocksAsText,
  WORKSPACE_EMPTY_HINTS,
} from "./seed-context.ts";

// ── Section → workspace mapping (board directive is source of truth) ──────────

test("Executive Summary sources from Concept + Financial", () => {
  const ws = getSectionSourceWorkspaces("executive-summary");
  assert.deepEqual(ws, ["concept", "financial"]);
});

test("Business Overview sources ONLY from Concept", () => {
  assert.deepEqual(getSectionSourceWorkspaces("company-overview"), ["concept"]);
});

test("Menu/Marketing section sources from Menu + Marketing + Concept", () => {
  assert.deepEqual(
    getSectionSourceWorkspaces("execution-marketing-sales"),
    ["menu", "marketing", "concept"],
  );
});

test("Operations Plan sources from Location + Equipment + Hiring", () => {
  assert.deepEqual(
    getSectionSourceWorkspaces("execution-operations"),
    ["location", "equipment", "hiring"],
  );
});

test("Management Team sources from Hiring + Concept", () => {
  assert.deepEqual(getSectionSourceWorkspaces("company-team"), ["hiring", "concept"]);
});

test("Financial sections source from Financial workspace", () => {
  for (const key of [
    "financial-plan-forecast",
    "financial-plan-statements",
    "financial-plan-financing",
    "financial-plan-unit-economics",
    "financial-plan-break-even",
    "financial-plan-sensitivity",
    "financial-plan-dscr",
  ]) {
    const ws = getSectionSourceWorkspaces(key);
    assert.ok(ws.includes("financial"), `${key} should source from Financial workspace`);
  }
});

test("Target Market sources from Concept", () => {
  assert.deepEqual(getSectionSourceWorkspaces("opportunity-target-market"), ["concept"]);
});

test("Unknown / custom section falls back to Concept", () => {
  assert.deepEqual(getSectionSourceWorkspaces("custom"), ["concept"]);
  assert.deepEqual(getSectionSourceWorkspaces("some-brand-new-key"), ["concept"]);
});

// ── Summarizer shape ──────────────────────────────────────────────────────────

test("summarizeConcept returns empty array for missing / empty content", () => {
  assert.deepEqual(summarizeConcept(null), []);
  assert.deepEqual(summarizeConcept(undefined), []);
  assert.deepEqual(summarizeConcept({ version: 2, components: {} }), []);
});

test("summarizeConcept surfaces identity, vision, differentiation, personas", () => {
  const doc = {
    version: 2,
    components: {
      shop_identity: { content: "Kestrel Coffee", included: true },
      vision: { content: "A morning-rush espresso bar for downtown commuters.", included: true },
      differentiation: { content: "Single-origin only, no flavored syrups.", included: true },
      brand_voice: { content: "", included: true },
      target_customer: { content: "", included: true },
      location: { content: "", included: false },
      offering: { content: "", included: false },
    },
    personas: [
      {
        id: "p1",
        name: "Morning Commuter",
        isPrimary: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        whyTheyVisit: "",
        ageRange: "25-35",
        visitFrequency: "daily",
      },
    ],
  };
  const bullets = summarizeConcept(doc);
  assert.ok(bullets.some((b) => b.includes("Kestrel Coffee")));
  assert.ok(bullets.some((b) => b.toLowerCase().includes("vision")));
  assert.ok(bullets.some((b) => b.toLowerCase().includes("differentiation")));
  assert.ok(bullets.some((b) => b.includes("Personas")));
  assert.ok(bullets.some((b) => b.includes("Morning Commuter")));
});

test("summarizeMenu returns category counts + price ranges, NOT full SKU list", () => {
  const menu = [
    { id: "1", name: "Espresso", category_name: "Espresso", price_cents: 350 },
    { id: "2", name: "Latte", category_name: "Espresso", price_cents: 550 },
    { id: "3", name: "Cortado", category_name: "Espresso", price_cents: 475 },
    { id: "4", name: "Croissant", category_name: "Pastries", price_cents: 400 },
    { id: "5", name: "Muffin", category_name: "Pastries", price_cents: 375 },
  ];
  const bullets = summarizeMenu(menu, "USD");
  // First line names size + category count
  assert.ok(bullets[0].includes("5 items"));
  assert.ok(bullets[0].includes("2"));
  // Per-category price range
  assert.ok(bullets.some((b) => b.startsWith("- Espresso:") && b.includes("$3.50") && b.includes("$5.50")));
  assert.ok(bullets.some((b) => b.startsWith("- Pastries:") && b.includes("$3.75") && b.includes("$4.00")));
  // Signature items — top-priced 3, not the whole menu
  assert.ok(bullets.some((b) => b.startsWith("- Signature items:")));
  // Does NOT include every SKU as a bullet
  assert.equal(bullets.filter((b) => b.startsWith("- Espresso") && !b.startsWith("- Espresso:")).length, 0);
});

test("summarizeMenu returns empty array when no menu items", () => {
  assert.deepEqual(summarizeMenu(null), []);
  assert.deepEqual(summarizeMenu([], "USD"), []);
});

test("summarizeFinancial returns headline numbers, NOT quarterly breakdown", () => {
  const model = {
    startup_costs: {
      build_out_cents: 5_000_000,
      licenses_cents: 200_000,
      deposits_cents: 800_000,
      equipment_cents: 4_000_000,
    },
    forecast_inputs: {
      currency_code: "USD",
      forecast_lines: [
        { category: "revenue", mode: "flat", value: 25_000_00 },
        { category: "revenue", mode: "flat", value: 15_000_00 },
        { category: "capex", mode: "flat", value: 2_000_000, useful_life_years: 7 },
      ],
    },
  };
  const bullets = summarizeFinancial(model, "USD");
  assert.ok(bullets.some((b) => b.startsWith("- Startup capital:")));
  assert.ok(bullets.some((b) => b.includes("Revenue assumptions")));
  assert.ok(bullets.some((b) => b.startsWith("- CapEx planned:")));
  // Does NOT include a per-quarter breakdown
  assert.equal(bullets.filter((b) => /\bQ[1-4]\b/.test(b)).length, 0);
});

test("summarizeFinancial returns empty array for empty model", () => {
  assert.deepEqual(summarizeFinancial(null), []);
  assert.deepEqual(summarizeFinancial({}, "USD"), []);
});

test("summarizeLocation picks the chosen candidate first", () => {
  const candidates = [
    { id: "a", name: "Site A", address: "1 Main St", neighborhood: "Downtown", sq_ft: 1200, asking_rent_cents: 350_000, status: "candidate", notes: null },
    { id: "b", name: "Site B", address: "2 Second Ave", neighborhood: "Uptown", sq_ft: 900, asking_rent_cents: 280_000, status: "chosen", notes: null },
    { id: "c", name: "Site C", address: null, neighborhood: null, sq_ft: null, asking_rent_cents: null, status: "candidate", notes: null },
  ];
  const bullets = summarizeLocation(candidates, "USD");
  assert.ok(bullets[0].includes("Site B"));
  assert.ok(bullets.some((b) => b.startsWith("- Also evaluated:")));
});

test("summarizeEquipment reports total spend + category counts", () => {
  const items = [
    { id: "1", name: "La Marzocco Linea", cost_local: 18000, category: "major", notes: null },
    { id: "2", name: "Mahlkonig E65s", cost_local: 4200, category: "major", notes: null },
    { id: "3", name: "Milk pitcher", cost_local: 45, category: "minor", notes: null },
  ];
  const bullets = summarizeEquipment(items, "USD");
  assert.ok(bullets[0].includes("3 items"));
  assert.ok(bullets.some((b) => b.startsWith("- Major equipment:") && b.includes("2 items")));
  assert.ok(bullets.some((b) => b.startsWith("- Minor equipment:") && b.includes("1 items")));
});

test("summarizeHiring reports headcount + monthly payroll", () => {
  const roles = [
    { id: "1", role_title: "Head Barista", headcount: 1, start_date: null, monthly_cost_cents: 500_000 },
    { id: "2", role_title: "Barista", headcount: 3, start_date: null, monthly_cost_cents: 1_200_000 },
  ];
  const bullets = summarizeHiring(roles, "USD");
  assert.ok(bullets.some((b) => b.startsWith("- Team size:") && b.includes("4 headcount")));
  assert.ok(bullets.some((b) => b.startsWith("- Monthly payroll:")));
  assert.ok(bullets.some((b) => b.startsWith("- Roles:") && b.includes("Head Barista") && b.includes("Barista")));
});

test("summarizeMarketing returns empty array when nothing filled", () => {
  assert.deepEqual(summarizeMarketing(null), []);
  assert.deepEqual(summarizeMarketing({}), []);
});

// ── buildSeedBlocksForSection: empty workspaces render explicit hints ─────────

test("empty workspaces produce isEmpty=true blocks with the canonical hint", () => {
  const blocks = buildSeedBlocksForSection("execution-operations", {
    // All three source workspaces empty
    locationRows: [],
    equipmentRows: [],
    hiringRows: [],
    currencyCode: "USD",
  });
  assert.equal(blocks.length, 3);
  assert.deepEqual(
    blocks.map((b) => b.id),
    ["location", "equipment", "hiring"],
  );
  for (const b of blocks) {
    assert.equal(b.isEmpty, true);
    assert.equal(b.bullets.length, 0);
    assert.ok(b.emptyHint && b.emptyHint.length > 0, `emptyHint should be set for ${b.id}`);
    assert.equal(b.emptyHint, WORKSPACE_EMPTY_HINTS[b.id]);
  }
});

test("filled workspaces produce isEmpty=false blocks in section order", () => {
  const blocks = buildSeedBlocksForSection("company-overview", {
    conceptContent: {
      version: 2,
      components: {
        shop_identity: { content: "Kestrel Coffee", included: true },
        vision: { content: "A morning-rush espresso bar.", included: true },
        differentiation: { content: "", included: true },
        brand_voice: { content: "", included: true },
        target_customer: { content: "", included: true },
        location: { content: "", included: false },
        offering: { content: "", included: false },
      },
    },
    currencyCode: "USD",
  });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, "concept");
  assert.equal(blocks[0].isEmpty, false);
  assert.ok(blocks[0].bullets.length > 0);
});

// ── formatSeedBlocksAsText: labeled headings, empty hints, edit-lines UX ──────

test("formatSeedBlocksAsText labels every block with FROM ... WORKSPACE:", () => {
  const out = formatSeedBlocksAsText([
    { id: "concept", label: "Concept", bullets: ["- Shop: Kestrel"], isEmpty: false },
    { id: "menu", label: "Menu & Pricing", bullets: [], isEmpty: true, emptyHint: "No content yet." },
  ]);
  assert.ok(out.includes("FROM CONCEPT WORKSPACE:"));
  assert.ok(out.includes("FROM MENU & PRICING WORKSPACE:"));
  assert.ok(out.includes("- Shop: Kestrel"));
  // Empty block shows the hint, never a blank heading
  assert.ok(out.includes("No content yet."));
});

test("formatSeedBlocksAsText opens with the edit-lines instruction", () => {
  const out = formatSeedBlocksAsText([
    { id: "concept", label: "Concept", bullets: ["- Shop: Kestrel"], isEmpty: false },
  ]);
  assert.ok(out.startsWith("Context from your workspaces"));
  assert.ok(out.includes("edit or remove any lines"));
});

test("formatSeedBlocksAsText returns empty string when no blocks", () => {
  assert.equal(formatSeedBlocksAsText([]), "");
});

test("formatSeedBlocksAsText honors a per-block heading override (BP-section case)", () => {
  const out = formatSeedBlocksAsText([
    { id: "concept", label: "Concept", bullets: ["- Shop: Kestrel"], isEmpty: false },
    {
      id: "bp-section:0",
      label: "Business Overview",
      heading: "FROM YOUR BUSINESS OVERVIEW DRAFT:",
      bullets: ["- Kestrel Coffee is a morning-rush espresso bar..."],
      isEmpty: false,
    },
  ]);
  assert.ok(out.includes("FROM CONCEPT WORKSPACE:"));
  assert.ok(out.includes("FROM YOUR BUSINESS OVERVIEW DRAFT:"));
  // The awkward workspace-shaped fallback should NOT appear for BP blocks.
  assert.equal(out.includes("BUSINESS OVERVIEW WORKSPACE:"), false);
});

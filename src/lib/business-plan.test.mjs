// TIM-2488: pin the currency-neutral primitives behind the BP suite-derived
// auto-content fix.
//
// Pre-fix, assembleBuildoutEquipment hard-coded "$" + a Number.toLocaleString
// of the equipment cost so a Canadian / AUD / GBP founder saw a literal
// dollar sign on every equipment line in the prompt and the rendered PDF.
// Post-fix, the per-item line interpolates `formatCurrencyAmount(value,
// currencyCode)` — Intl-formatted with the plan's actual currency code.
//
// business-plan.ts itself uses `@/` path aliases which the node:test
// --experimental-strip-types runner does not resolve. Both primitives the
// fix relies on (formatCurrencyAmount from currency.ts and
// formatEntitiesForPrompt from business-plan/entities.ts) are self-contained,
// so we pin them here. The entities.test.mjs and plan-state.test.mjs files
// already exercise the cost_local field rename through their fixtures.

import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyAmount } from "./currency.ts";
import { formatEntitiesForPrompt } from "./business-plan/entities.ts";

// ── Primitive: formatCurrencyAmount — never emits the literal string "USD" ───
// when the currency code is non-USD. The "$" sign itself is locale-correct
// for CAD/AUD (Canadian/Australian dollars both write "$18,500" natively),
// so this primitive's job is solely to scrub the literal three-letter "USD".

test("formatCurrencyAmount — CAD never emits literal 'USD'", () => {
  const out = formatCurrencyAmount(18500, "CAD", { compact: false });
  assert.doesNotMatch(out, /\bUSD\b/, "no literal 'USD' on CAD");
  assert.match(out, /18,?500/);
});

test("formatCurrencyAmount — AUD never emits literal 'USD'", () => {
  const out = formatCurrencyAmount(18500, "AUD", { compact: false });
  assert.doesNotMatch(out, /\bUSD\b/, "no literal 'USD' on AUD");
  assert.match(out, /18,?500/);
});

test("formatCurrencyAmount — GBP never emits literal 'USD' and uses £", () => {
  const out = formatCurrencyAmount(18500, "GBP", { compact: false });
  assert.doesNotMatch(out, /\bUSD\b/);
  assert.match(out, /£/);
});

test("formatCurrencyAmount — EUR never emits literal 'USD' and uses €", () => {
  const out = formatCurrencyAmount(18500, "EUR", { compact: false });
  assert.doesNotMatch(out, /\bUSD\b/);
  assert.match(out, /€/);
});

test("formatCurrencyAmount — USD does emit '$' (the only case where the symbol is correct)", () => {
  const out = formatCurrencyAmount(18500, "USD", { compact: false });
  assert.match(out, /\$18,?500/);
});

// ── Primitive: formatEntitiesForPrompt — equipment cost ISO code on prompts ──

const EQUIP_ENTITIES = [
  { id: "equipment:E1", canonical: "La Marzocco GB5", type: "equipment",
    aliases: [], source: "buildout_equipment_items", value_cents: 1850000 },
  { id: "equipment:E2", canonical: "Mahlkönig EK43",  type: "equipment",
    aliases: [], source: "buildout_equipment_items", value_cents: 420000 },
];

test("formatEntitiesForPrompt — USD plan surfaces equipment-cost lines with 'USD <amount>'", () => {
  const block = formatEntitiesForPrompt(EQUIP_ENTITIES, "USD");
  assert.match(block, /La Marzocco GB5 \(cost USD 18,500\)/);
  assert.match(block, /Mahlkönig EK43 \(cost USD 4,200\)/);
});

test("formatEntitiesForPrompt — CAD plan surfaces equipment-cost lines with 'CAD <amount>' and NEVER 'USD'", () => {
  const block = formatEntitiesForPrompt(EQUIP_ENTITIES, "CAD");
  assert.match(block, /La Marzocco GB5 \(cost CAD 18,500\)/);
  assert.match(block, /Mahlkönig EK43 \(cost CAD 4,200\)/);
  assert.doesNotMatch(block, /\bUSD\b/, "CAD-coded prompt block must never leak 'USD'");
});

test("formatEntitiesForPrompt — AUD plan never leaks 'USD'", () => {
  const block = formatEntitiesForPrompt(EQUIP_ENTITIES, "AUD");
  assert.doesNotMatch(block, /\bUSD\b/);
  assert.match(block, /AUD/);
});

test("formatEntitiesForPrompt — GBP plan never leaks 'USD'", () => {
  const block = formatEntitiesForPrompt(EQUIP_ENTITIES, "GBP");
  assert.doesNotMatch(block, /\bUSD\b/);
  assert.match(block, /GBP/);
});

test("formatEntitiesForPrompt — EUR plan never leaks 'USD'", () => {
  const block = formatEntitiesForPrompt(EQUIP_ENTITIES, "EUR");
  assert.doesNotMatch(block, /\bUSD\b/);
  assert.match(block, /EUR/);
});

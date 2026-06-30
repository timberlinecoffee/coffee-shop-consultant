import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluateDeepSeekGeoGate, isEea, EU_GATE_COUNTRY_SET } from "./eea.ts";

test("isEea — EU 27 members are gated", () => {
  const eu27 = [
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR",
    "DE","GR","HU","IE","IT","LV","LT","LU","MT","NL",
    "PL","PT","RO","SK","SI","ES","SE",
  ];
  for (const c of eu27) assert.equal(isEea(c), true, `${c} should be EU-gated`);
  assert.equal(eu27.length, 27);
});

test("isEea — EEA-only non-EU members (Iceland, Liechtenstein, Norway) are gated", () => {
  assert.equal(isEea("IS"), true);
  assert.equal(isEea("LI"), true);
  assert.equal(isEea("NO"), true);
});

test("isEea — UK and Switzerland are gated (per Legal scope)", () => {
  assert.equal(isEea("GB"), true);
  assert.equal(isEea("CH"), true);
});

test("isEea — non-EU countries are not gated", () => {
  for (const c of ["US", "CA", "MX", "AU", "NZ", "JP", "BR", "ZA", "IN"]) {
    assert.equal(isEea(c), false, `${c} should NOT be EU-gated`);
  }
});

test("isEea — lowercase / mixed-case input is normalized", () => {
  assert.equal(isEea("de"), true);
  assert.equal(isEea("Fr"), true);
  assert.equal(isEea("us"), false);
});

test("isEea — null / undefined / empty input is treated as non-EU", () => {
  assert.equal(isEea(null), false);
  assert.equal(isEea(undefined), false);
  assert.equal(isEea(""), false);
});

test("EU_GATE_COUNTRY_SET — 32 distinct entries (EU 27 + IS + LI + NO + GB + CH)", () => {
  assert.equal(EU_GATE_COUNTRY_SET.size, 32);
});

test("evaluateDeepSeekGeoGate — EU request returns eu_gate_blocked, not allowed", () => {
  for (const c of ["DE", "FR", "IE", "IT", "NL", "GB", "CH", "NO"]) {
    const d = evaluateDeepSeekGeoGate(c);
    assert.equal(d.allowed, false, `${c} should not be allowed for DeepSeek`);
    assert.equal(d.reason, "eu_gate_blocked");
  }
});

test("evaluateDeepSeekGeoGate — non-EU request is allowed", () => {
  for (const c of ["US", "CA", "MX", "AU", "JP", "BR"]) {
    const d = evaluateDeepSeekGeoGate(c);
    assert.equal(d.allowed, true, `${c} should be allowed for DeepSeek`);
    assert.equal(d.reason, "ok");
  }
});

test("evaluateDeepSeekGeoGate — unknown country falls back to block (conservative)", () => {
  const d1 = evaluateDeepSeekGeoGate(null);
  assert.equal(d1.allowed, false);
  assert.equal(d1.reason, "unknown_region_blocked");
  const d2 = evaluateDeepSeekGeoGate(undefined);
  assert.equal(d2.allowed, false);
  assert.equal(d2.reason, "unknown_region_blocked");
  const d3 = evaluateDeepSeekGeoGate("");
  assert.equal(d3.allowed, false);
  assert.equal(d3.reason, "unknown_region_blocked");
});

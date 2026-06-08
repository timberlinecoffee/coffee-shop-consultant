// TIM-2331: Pin buildBpSectionPrompt parity with the inline prompt the
// /generate route used pre-extraction, plus the regenerable-section invariant.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBpSectionPrompt,
  BP_REGENERABLE_SECTION_KEYS,
  BP_SECTION_SPECS,
} from "./business-plan-prompts.ts";

const baseInputs = {
  shopName: "Summit Street Coffee",
  planSnapshot: "Lease: 1,200 sq ft on Main.",
  founderBudget: "$300k",
  founderLocation: "United States",
  founderStage: "Lease signed",
  // TIM-2466: shop_type — strongest persona signal when workspace modules
  // are empty. Without it /generate and /regenerate-all collapsed to a
  // generic café (CQ-06 byte-identical content).
  founderShopType: "Full cafe with food",
};

test("executive-summary uses the executive-summary system + user message shape", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "executive-summary",
    sectionTitle: "Executive Summary",
    sectionAutoContent: "",
  });
  assert.match(out.systemPrompt, /writing an executive summary/);
  assert.match(out.userMessage, /Write the executive summary for Summit Street Coffee\./);
  assert.match(out.userMessage, /Budget: \$300k/);
  assert.match(out.userMessage, /Lease: 1,200 sq ft on Main\./);
  assert.equal(out.maxTokens, 900);
});

test("non-executive sections quote the section title and include section spec", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "execution-operations",
    sectionTitle: "Operations",
    sectionAutoContent: "Address: 100 Main St.",
  });
  assert.match(out.systemPrompt, /writing the "Operations" section/);
  assert.match(out.userMessage, /Write the "Operations" section for Summit Street Coffee\./);
  assert.match(out.userMessage, /Address: 100 Main St\./);
  assert.match(out.userMessage, /Lease: 1,200 sq ft on Main\./);
  assert.equal(out.maxTokens, 1600);
});

test("BP_REGENERABLE_SECTION_KEYS excludes appendix-monthly-statements (data dump)", () => {
  assert.ok(!BP_REGENERABLE_SECTION_KEYS.includes("appendix-monthly-statements"));
  assert.ok(BP_REGENERABLE_SECTION_KEYS.includes("executive-summary"));
  assert.ok(BP_REGENERABLE_SECTION_KEYS.includes("financial-plan-statements"));
});

test("every regenerable key has a section spec", () => {
  for (const key of BP_REGENERABLE_SECTION_KEYS) {
    assert.ok(
      typeof BP_SECTION_SPECS[key] === "string" && BP_SECTION_SPECS[key].length > 0,
      `missing spec for ${key}`,
    );
  }
});

test("empty section auto-content falls back to a hint string in the user message", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "execution-marketing-sales",
    sectionTitle: "Marketing & Sales",
    sectionAutoContent: "",
  });
  assert.match(out.userMessage, /No section-specific data entered for this section yet/);
});

// TIM-2342: source-marker directive + industry benchmarks block.
test("source-marker directive ships in the system prompt when provided", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "execution-operations",
    sectionTitle: "Operations",
    sectionAutoContent: "Address: 100 Main St.",
    sourceMarkerDirective: 'Source-marker rule (every quantitative claim must be tagged): use <num src="...">',
  });
  assert.match(out.systemPrompt, /Source-marker rule/);
  assert.match(out.systemPrompt, /<num src=/);
});

test("industry benchmarks block ships in the user message when provided", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "financial-plan-statements",
    sectionTitle: "Financial Statements",
    sectionAutoContent: "Year 1 revenue projected.",
    industryBenchmarks: "Industry Benchmarks block:\n- Blended COGS: 28-32%",
  });
  assert.match(out.userMessage, /Industry Benchmarks/);
  assert.match(out.userMessage, /Blended COGS: 28-32%/);
});

test("source-marker + benchmarks both ship for executive-summary path", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "executive-summary",
    sectionTitle: "Executive Summary",
    sectionAutoContent: "",
    sourceMarkerDirective: "Source-marker rule (every quantitative claim must be tagged)",
    industryBenchmarks: "Industry Benchmarks block:\n- Avg ticket: $6-$9",
  });
  assert.match(out.systemPrompt, /Source-marker rule/);
  assert.match(out.userMessage, /Industry Benchmarks/);
  assert.match(out.userMessage, /Avg ticket: \$6-\$9/);
});

// TIM-2466: shop_type belongs in the founder context block so persona
// signal reaches the LLM even when workspace modules are empty.
test("founder context includes shop_type line (executive-summary path)", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "executive-summary",
    sectionTitle: "Executive Summary",
    sectionAutoContent: "",
    founderShopType: "Drive-through",
  });
  assert.match(out.userMessage, /Shop type: Drive-through/);
});

test("founder context includes shop_type line (non-executive section path)", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "execution-operations",
    sectionTitle: "Operations",
    sectionAutoContent: "Address: 100 Main St.",
    founderShopType: "Mobile cart or kiosk",
  });
  assert.match(out.userMessage, /Shop type: Mobile cart or kiosk/);
});

test("shop_type lift makes two personas produce distinct prompts even with empty workspaces", () => {
  // CQ-06 regression: every persona produced the same prompt because shop_type
  // never reached the prompt. With the lift, two personas with different
  // shop_type strings must produce distinct userMessage payloads.
  const fullCafe = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "executive-summary",
    sectionTitle: "Executive Summary",
    sectionAutoContent: "",
    planSnapshot: "",
    founderShopType: "Full cafe with food",
  });
  const mobileCart = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "executive-summary",
    sectionTitle: "Executive Summary",
    sectionAutoContent: "",
    planSnapshot: "",
    founderShopType: "Mobile cart or kiosk",
  });
  assert.notEqual(fullCafe.userMessage, mobileCart.userMessage);
  assert.match(fullCafe.userMessage, /Shop type: Full cafe with food/);
  assert.match(mobileCart.userMessage, /Shop type: Mobile cart or kiosk/);
});

test("source-marker + benchmarks are absent when not provided (no extra empty lines)", () => {
  const out = buildBpSectionPrompt({
    ...baseInputs,
    sectionKey: "execution-operations",
    sectionTitle: "Operations",
    sectionAutoContent: "Address: 100 Main St.",
  });
  assert.ok(!out.systemPrompt.includes("Source-marker rule"));
  assert.ok(!out.userMessage.includes("Industry Benchmarks"));
});

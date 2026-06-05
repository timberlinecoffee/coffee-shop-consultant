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

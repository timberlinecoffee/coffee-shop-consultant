// TIM-1578: contract tests for illustration recipes + cost/prompt helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECIPES,
  getRecipe,
  resolvePrompt,
  estimateCostUsd,
  STYLE_SUFFIX,
  OPENAI_IMAGE_MODEL,
} from "./recipes.ts";

test("every recipe has a unique id and a known slot", () => {
  const slots = new Set(["hero", "recipe-card", "empty-state", "lesson"]);
  const ids = new Set();
  for (const r of RECIPES) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(slots.has(r.slot), `unknown slot ${r.slot}`);
    assert.ok(r.alt && r.alt.length > 0, `recipe ${r.id} missing alt`);
  }
});

test("the two proof recipes referenced by TIM-1578 exist", () => {
  assert.ok(getRecipe("hero-your-coffee-shop"), "hero recipe missing");
  assert.ok(getRecipe("recipe-flat-white"), "flat white recipe missing");
});

test("resolvePrompt builds from the canonical TIM-1579 recipe", () => {
  const r = getRecipe("recipe-flat-white");
  const prompt = resolvePrompt(r);
  // canonical master-template opener + §5.3 subject string + brand token + negatives
  assert.ok(prompt.startsWith("Minimal continuous-line illustration,"), "canonical template opener");
  assert.ok(prompt.includes("latte art rosettta pattern"), "canonical §5.3 subject string");
  assert.ok(prompt.includes("#155e63"), "prompt should carry the brand teal token");
  assert.ok(prompt.includes("Avoid: no color fills"), "negative prompts appended");
});

test("legacy inline prompts (no slots) still get STYLE_SUFFIX", () => {
  const prompt = resolvePrompt({ subject: "a single coffee bean" });
  assert.ok(prompt.endsWith(STYLE_SUFFIX.trim()), "style suffix appended for slotless prompts");
});

test("cost estimate is in the documented gpt-image-1.5 range", () => {
  const hero = getRecipe("hero-your-coffee-shop");
  const card = getRecipe("recipe-flat-white");
  // hero: 1536x1024 high ~= $0.20; card: 1024x1536 medium ~= $0.051
  assert.ok(estimateCostUsd(hero) > 0.15 && estimateCostUsd(hero) <= 0.2, "hero cost out of range");
  assert.ok(estimateCostUsd(card) > 0.02 && estimateCostUsd(card) < 0.08, "card cost out of range");
});

test("recommended model is not the deprecated gpt-image-1", () => {
  assert.equal(OPENAI_IMAGE_MODEL, "gpt-image-1.5");
});

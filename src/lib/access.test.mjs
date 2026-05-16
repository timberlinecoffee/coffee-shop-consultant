// TIM-545: paywall regression tests. These pin down the contract that the
// /plan route guard and the section-level gating UI consult the same access
// policy, so a free user can never reach paid content.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  canAccessModule,
  canAccessSection,
  isPaidTier,
  normalizeTier,
  FREE_PREVIEW_MODULE,
  FREE_PREVIEW_SECTION_KEYS,
  UPGRADE_PATH,
} from "./access.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

// ── Policy unit tests ─────────────────────────────────────────────────────

test("free tier is not paid", () => {
  assert.equal(isPaidTier("free"), false);
  assert.equal(isPaidTier(null), false);
  assert.equal(isPaidTier(undefined), false);
  assert.equal(isPaidTier("free_trial"), false);
});

test("starter, growth, and pro are paid tiers", () => {
  assert.equal(isPaidTier("starter"), true);
  assert.equal(isPaidTier("growth"), true);
  assert.equal(isPaidTier("pro"), true);
});

test("normalizeTier maps unknown values to free", () => {
  assert.equal(normalizeTier("free_trial"), "free");
  assert.equal(normalizeTier(null), "free");
  assert.equal(normalizeTier("starter"), "starter");
  assert.equal(normalizeTier("growth"), "growth");
  assert.equal(normalizeTier("pro"), "pro");
  // Legacy names from pre-TIM-641 must no longer be recognized as paid.
  assert.equal(normalizeTier("builder"), "free");
  assert.equal(normalizeTier("accelerator"), "free");
});

test("free users can access the preview module only", () => {
  assert.equal(canAccessModule("free", FREE_PREVIEW_MODULE), true);
  for (const m of [2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(
      canAccessModule("free", m),
      false,
      `Module ${m} must be paywalled for free users`
    );
  }
});

test("paid users can access every module", () => {
  for (const tier of ["starter", "growth", "pro"]) {
    for (let m = 1; m <= 8; m++) {
      assert.equal(canAccessModule(tier, m), true);
    }
  }
});

test("free users only see the preview section inside the preview module", () => {
  // The first section is the free preview.
  for (const key of FREE_PREVIEW_SECTION_KEYS) {
    assert.equal(canAccessSection("free", FREE_PREVIEW_MODULE, key), true);
  }
  // Every other Module 1 section is paywalled.
  for (const key of [
    "your_why",
    "target_customer",
    "competitive_analysis",
    "concept_brief",
  ]) {
    assert.equal(
      canAccessSection("free", FREE_PREVIEW_MODULE, key),
      false,
      `free users must not access Module 1 section ${key}`
    );
  }
  // No section in any other module is accessible to a free user.
  for (const key of ["startup_costs", "revenue_projections"]) {
    assert.equal(canAccessSection("free", 2, key), false);
  }
});

test("paid users see every section", () => {
  for (const tier of ["starter", "growth", "pro"]) {
    for (const key of [
      "shop_type",
      "your_why",
      "concept_brief",
      "startup_costs",
      "financial_summary",
    ]) {
      assert.equal(canAccessSection(tier, 1, key), true);
      assert.equal(canAccessSection(tier, 2, key), true);
    }
  }
});

// ── Server-side guard wiring ──────────────────────────────────────────────

// TIM-627 removed src/app/plan/[moduleNumber]/{page,module-client}.tsx as part
// of the destructive plan-page deletion. The upgrade-gate redirect tests that
// lived here will return once the new workspace-key routes are in place.

test("coach API returns 403 for free users", () => {
  const src = read("src/app/api/coach/route.ts");
  assert.match(
    src,
    /profile\.subscription_tier\s*===\s*["']free["'][\s\S]{0,400}status:\s*403/,
    "/api/coach must return 403 when the caller is on the free tier"
  );
});

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

test("page.tsx redirects free users from paid modules to the upgrade path", () => {
  const src = read("src/app/plan/[moduleNumber]/page.tsx");
  assert.match(
    src,
    /import\s*\{[^}]*canAccessModule[^}]*\}\s*from\s*["']@\/lib\/access["']/,
    "page.tsx must import canAccessModule from the access policy"
  );
  assert.match(
    src,
    /if\s*\(\s*!canAccessModule\(\s*subscriptionTier\s*,\s*moduleNum\s*\)\s*\)\s*\{[\s\S]*?redirect\(/,
    "page.tsx must redirect when canAccessModule returns false"
  );
  assert.match(
    src,
    /import\s*\{[^}]*UPGRADE_PATH[^}]*\}\s*from\s*["']@\/lib\/access["']/,
    "page.tsx must import UPGRADE_PATH from the access policy"
  );
  assert.match(
    src,
    /redirect\(\s*[`"][^"`]*\$\{UPGRADE_PATH\}/,
    "page.tsx must redirect using the canonical UPGRADE_PATH constant"
  );
  // Sanity: the constant itself resolves to /pricing today; if that changes,
  // tests should still cover the redirect target via the constant.
  assert.equal(UPGRADE_PATH, "/pricing");
});

test("page.tsx passes freePreview to the module client based on tier", () => {
  const src = read("src/app/plan/[moduleNumber]/page.tsx");
  assert.match(
    src,
    /freePreview=\{\s*!isPaidTier\(subscriptionTier\)\s*\}/,
    "ModuleClient must receive freePreview derived from isPaidTier"
  );
});

test("module-client renders an UpgradeGate for inaccessible sections", () => {
  const src = read("src/app/plan/[moduleNumber]/module-client.tsx");
  assert.match(
    src,
    /import\s*\{\s*UpgradeGate\s*\}\s*from\s*["']@\/components\/upgrade-gate["']/,
    "module-client must import the shared UpgradeGate"
  );
  assert.match(
    src,
    /import\s*\{\s*canAccessSection\s*\}\s*from\s*["']@\/lib\/access["']/,
    "module-client must import canAccessSection"
  );
  assert.match(
    src,
    /sectionAccessible\s*=\s*\(key:\s*string\)\s*=>\s*\n?\s*!freePreview\s*\|\|\s*canAccessSection\(/,
    "module-client must gate sections through canAccessSection when in free preview"
  );
  assert.match(
    src,
    /!activeSectionAccessible[\s\S]{0,200}<UpgradeGate/,
    "module-client must render <UpgradeGate /> when the active section is gated"
  );
});

test("coach API returns 403 for free users", () => {
  const src = read("src/app/api/coach/route.ts");
  assert.match(
    src,
    /profile\.subscription_tier\s*===\s*["']free["'][\s\S]{0,400}status:\s*403/,
    "/api/coach must return 403 when the caller is on the free tier"
  );
});

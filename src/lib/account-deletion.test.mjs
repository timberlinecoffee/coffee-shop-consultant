// TIM-2254: regression tests for account-deletion helpers.
//
// Pins the contracts that protect the GDPR/CASL spec:
//   - hashWithSalt is deterministic + 64-char hex (audit log column expects it).
//   - timingSafeEqualStr returns true only on exact byte match (different
//     lengths must be safe and return false).
//   - PLAN_SCOPED_TABLES / USER_SCOPED_TABLES list the user-content tables the
//     deletion sequence must wipe. New user tables MUST be added here, so this
//     test fails loudly if anyone removes one by accident.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashWithSalt,
  timingSafeEqualStr,
  PLAN_SCOPED_TABLES,
  USER_SCOPED_TABLES,
  PLAN_SCOPED_BUCKETS,
} from "./account-deletion.ts";

test("hashWithSalt returns deterministic 64-char sha256 hex", () => {
  const a = hashWithSalt("user-id-1");
  const b = hashWithSalt("user-id-1");
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("hashWithSalt differs by input", () => {
  assert.notEqual(hashWithSalt("a"), hashWithSalt("b"));
});

test("timingSafeEqualStr returns true on identical strings", () => {
  assert.equal(timingSafeEqualStr("trent@example.com", "trent@example.com"), true);
});

test("timingSafeEqualStr returns false on length mismatch (no throw)", () => {
  assert.equal(timingSafeEqualStr("short", "much-longer-string"), false);
});

test("timingSafeEqualStr returns false on content mismatch", () => {
  assert.equal(timingSafeEqualStr("a@b.com", "x@b.com"), false);
});

test("PLAN_SCOPED_TABLES covers the user-plan-content tables we know about", () => {
  // If any of these are missing, the deletion sequence will leave user data
  // behind and we violate GDPR/CASL §17.
  const required = [
    "ai_conversations",
    "business_plan_sections",
    "business_plan_cover",
    "business_plan_financial_documents",
    "workspace_documents",
    "workspace_responses",
    "workspace_status",
    "buildout_equipment_items",
    "buildout_supplies_items",
    "menu_items",
    "menu_categories",
    "menu_ingredients",
    "milestones",
    "launch_milestones",
    "launch_timeline_items",
    "financial_models",
    "interview_candidates",
    "interview_questions",
    "interview_scorecards",
    "staff_files",
    "vendors",
    "brand_config",
  ];
  for (const t of required) {
    assert.ok(
      PLAN_SCOPED_TABLES.includes(t),
      `PLAN_SCOPED_TABLES must include ${t} (deletion-scope completeness)`,
    );
  }
});

test("USER_SCOPED_TABLES covers credit + analytics user tables", () => {
  const required = [
    "ai_errors",
    "ai_usage_log",
    "analytics_events",
    "credit_transactions",
    "user_ui_prefs",
  ];
  for (const t of required) {
    assert.ok(
      USER_SCOPED_TABLES.includes(t),
      `USER_SCOPED_TABLES must include ${t}`,
    );
  }
});

test("PLAN_SCOPED_TABLES does NOT include payment-retention tables", () => {
  // Spec §8: invoices + subscriptions are RETAINED for 7 years. They must
  // never appear in the deletion fan-out.
  for (const banned of ["invoices", "subscriptions", "support_messages"]) {
    assert.ok(
      !PLAN_SCOPED_TABLES.includes(banned),
      `PLAN_SCOPED_TABLES must NOT include ${banned} (retained)`,
    );
    assert.ok(
      !USER_SCOPED_TABLES.includes(banned),
      `USER_SCOPED_TABLES must NOT include ${banned} (retained)`,
    );
  }
});

test("PLAN_SCOPED_BUCKETS does NOT include the invoices bucket", () => {
  // Invoice PDFs are payment records — retained for 7 years per spec §8.
  assert.ok(!PLAN_SCOPED_BUCKETS.includes("invoices"));
});

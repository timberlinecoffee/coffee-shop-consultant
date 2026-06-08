// TIM-1911: render-level tests for the Settings shell and Billing tab.
// Uses Node's built-in test runner (no JSDOM); tests data contracts and
// structure that JSX render tests would cover. Full RTL render tests require
// adding JSDOM — tracked as follow-up in TIM-1910c review.

import { test } from "node:test";
import assert from "node:assert/strict";

const { SETTINGS_TABS } = await import("./tabs.ts");
const { MOCK_INVOICES } = await import("./mock-invoices.ts");

// --- Settings shell ---

test("SETTINGS_TABS has exactly 8 entries", () => {
  // TIM-2423: added "preferences" tab to host Guided Notices resurface UI.
  assert.strictEqual(SETTINGS_TABS.length, 8);
});

test("SETTINGS_TABS contains all required IDs in order", () => {
  const ids = SETTINGS_TABS.map((t) => t.id);
  assert.deepEqual(ids, [
    "account",
    "localization",
    "billing",
    "notifications",
    "business-profile",
    "preferences",
    "data",
    "appearance",
  ]);
});

test("SETTINGS_TABS every entry has non-empty id and label", () => {
  for (const tab of SETTINGS_TABS) {
    assert.ok(typeof tab.id === "string" && tab.id.length > 0, `id: ${tab.id}`);
    assert.ok(
      typeof tab.label === "string" && tab.label.length > 0,
      `label: ${tab.label}`
    );
  }
});

// --- Billing tab mock invoices ---

test("MOCK_INVOICES has at least one row", () => {
  assert.ok(MOCK_INVOICES.length >= 1);
});

test("MOCK_INVOICES rows have all five required columns", () => {
  const REQUIRED = ["date", "description", "amount", "status", "downloadUrl"];
  for (const row of MOCK_INVOICES) {
    for (const col of REQUIRED) {
      assert.ok(col in row, `missing column: ${col}`);
      assert.ok(
        typeof row[col] === "string",
        `${col} must be a string, got ${typeof row[col]}`
      );
    }
  }
});

test("MOCK_INVOICES amounts start with currency symbol", () => {
  for (const row of MOCK_INVOICES) {
    assert.match(row.amount, /^\$/, `amount should start with $: ${row.amount}`);
  }
});

test("MOCK_INVOICES status values are non-empty strings", () => {
  for (const row of MOCK_INVOICES) {
    assert.ok(row.status.length > 0, "empty status");
  }
});
